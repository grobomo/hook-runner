#!/usr/bin/env node
"use strict";
/**
 * Hook Diagnostics — transparency and auditing for Claude Code hooks
 *
 * Resolves exactly which settings.json files Claude Code would load for a
 * given project, extracts all hook definitions, validates script paths,
 * and reports broken/orphaned hooks.
 *
 * Usage:
 *   node diagnose.js                          # diagnose current dir
 *   node diagnose.js /path/to/project         # diagnose specific project
 *   node diagnose.js --json                   # machine-readable output
 *   node diagnose.js --fix                    # auto-fix broken hooks
 *
 * Claude Code settings resolution order:
 *   1. ~/.claude/settings.json (user global)
 *   2. ~/.claude/settings.local.json (user local, gitignored)
 *   3. Walk from project dir up to filesystem root, loading each
 *      .claude/settings.json and .claude/settings.local.json found
 *   4. $CLAUDE_PROJECT_DIR/.claude/settings.json (project)
 *   5. $CLAUDE_PROJECT_DIR/.claude/settings.local.json (project local)
 *
 * Hooks from ALL loaded files are merged (not overridden).
 */
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var HOME = os.homedir();

// ============================================================
// Settings Resolution
// ============================================================

/**
 * Find all settings.json files that Claude Code would load for a project.
 * Returns array of { path, scope, exists } in load order.
 */
function resolveSettingsFiles(projectDir) {
  var files = [];
  var seen = {};

  function add(filePath, scope) {
    var norm = filePath.replace(/\\/g, "/").toLowerCase();
    if (seen[norm]) return;
    seen[norm] = true;
    files.push({
      path: filePath,
      scope: scope,
      exists: fs.existsSync(filePath)
    });
  }

  // 1. User global
  add(path.join(HOME, ".claude", "settings.json"), "user-global");
  add(path.join(HOME, ".claude", "settings.local.json"), "user-local");

  // 2. Walk up from project dir to root (ancestor projects)
  var current = path.resolve(projectDir);
  var ancestors = [];
  while (true) {
    var parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    var claudeDir = path.join(current, ".claude");
    if (fs.existsSync(claudeDir)) {
      ancestors.push(current);
    }
  }
  // Load ancestors from outermost to innermost (reverse)
  ancestors.reverse();
  for (var i = 0; i < ancestors.length; i++) {
    var aDir = ancestors[i];
    // Skip if this IS the project dir (handled separately)
    if (path.resolve(aDir) === path.resolve(projectDir)) continue;
    add(path.join(aDir, ".claude", "settings.json"), "ancestor:" + path.basename(aDir));
    add(path.join(aDir, ".claude", "settings.local.json"), "ancestor:" + path.basename(aDir));
  }

  // 3. Project settings
  add(path.join(projectDir, ".claude", "settings.json"), "project");
  add(path.join(projectDir, ".claude", "settings.local.json"), "project-local");

  return files;
}

// ============================================================
// Hook Extraction
// ============================================================

/**
 * Extract hook definitions from a settings object.
 * Returns array of { event, command, timeout, type, index }.
 */
function extractHooks(settings) {
  var hooks = [];
  if (!settings || !settings.hooks) return hooks;

  var events = Object.keys(settings.hooks);
  for (var e = 0; e < events.length; e++) {
    var event = events[e];
    var groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var hookList = group.hooks || [];
      for (var h = 0; h < hookList.length; h++) {
        var hook = hookList[h];
        hooks.push({
          event: event,
          command: hook.command || "",
          timeout: hook.timeout || 0,
          type: hook.type || "command",
          groupIndex: g,
          hookIndex: h
        });
      }
    }
  }
  return hooks;
}

// ============================================================
// Hook Validation
// ============================================================

/**
 * Resolve $CLAUDE_PROJECT_DIR and ~ in a command to find the script path.
 * Returns { scriptPath, resolved, exists, error }.
 */
function validateHookCommand(command, projectDir) {
  if (!command) return { scriptPath: null, resolved: null, exists: false, error: "empty command" };

  // Extract the script path from common patterns
  var scriptPath = null;

  // Pattern: bash -c 'python "$CLAUDE_PROJECT_DIR/..."'
  var bashMatch = command.match(/\$CLAUDE_PROJECT_DIR\/([^"'\s]+)/);
  if (bashMatch) {
    scriptPath = path.join(projectDir, bashMatch[1]);
  }

  // Pattern: node "path/to/script.js"
  if (!scriptPath) {
    var nodeMatch = command.match(/\bnode\s+"([^"]+)"/);
    if (nodeMatch) {
      var p = nodeMatch[1];
      p = p.replace(/\$HOME/g, HOME).replace(/^~/g, HOME);
      scriptPath = p;
    }
  }

  // Pattern: python "path/to/script.py"
  if (!scriptPath) {
    var pyMatch = command.match(/\bpython[3]?\s+"([^"]+)"/);
    if (pyMatch) {
      var p2 = pyMatch[1];
      p2 = p2.replace(/\$CLAUDE_PROJECT_DIR/g, projectDir);
      p2 = p2.replace(/\$HOME/g, HOME).replace(/^~/g, HOME);
      scriptPath = p2;
    }
  }

  // Pattern: python $CLAUDE_PROJECT_DIR/...
  if (!scriptPath) {
    var pyMatch2 = command.match(/\bpython[3]?\s+\$CLAUDE_PROJECT_DIR\/(\S+)/);
    if (pyMatch2) {
      scriptPath = path.join(projectDir, pyMatch2[1]);
    }
  }

  if (!scriptPath) {
    // Can't parse — might be inline bash, not a file reference
    return { scriptPath: null, resolved: command, exists: null, error: null, unparseable: true };
  }

  // Detect Windows absolute paths when running in WSL — these are cross-platform
  // hooks from the Windows settings.json, not broken hooks
  if (/^[A-Za-z]:[\\/]/.test(scriptPath) && process.platform === "linux" && fs.existsSync("/proc/version")) {
    try {
      var ver = fs.readFileSync("/proc/version", "utf-8");
      if (/microsoft|wsl/i.test(ver)) {
        return { scriptPath: scriptPath, resolved: scriptPath, exists: null, error: null, crossPlatform: true };
      }
    } catch (e) {}
  }

  var resolved = path.resolve(scriptPath);
  return {
    scriptPath: scriptPath,
    resolved: resolved,
    exists: fs.existsSync(resolved),
    error: fs.existsSync(resolved) ? null : "script not found"
  };
}

// ============================================================
// Diagnosis
// ============================================================

function diagnose(projectDir, options) {
  options = options || {};
  var results = {
    projectDir: path.resolve(projectDir),
    settingsFiles: [],
    hooks: [],
    broken: [],
    summary: {}
  };

  // Resolve all settings files
  var settingsFiles = resolveSettingsFiles(projectDir);
  results.settingsFiles = settingsFiles;

  // Extract hooks from each existing settings file
  var allHooks = [];
  for (var i = 0; i < settingsFiles.length; i++) {
    var sf = settingsFiles[i];
    if (!sf.exists) continue;

    var content;
    try {
      content = JSON.parse(fs.readFileSync(sf.path, "utf-8"));
    } catch (e) {
      sf.parseError = e.message;
      continue;
    }

    var hooks = extractHooks(content);
    for (var j = 0; j < hooks.length; j++) {
      hooks[j].source = sf.path;
      hooks[j].scope = sf.scope;
      var validation = validateHookCommand(hooks[j].command, projectDir);
      hooks[j].validation = validation;
      if (validation.error) {
        results.broken.push(hooks[j]);
      }
    }
    allHooks = allHooks.concat(hooks);
  }
  results.hooks = allHooks;

  // Also check hook-runner modules
  var modulesDir = path.join(HOME, ".claude", "hooks", "run-modules");
  var moduleCount = 0;
  var modulesBroken = [];
  if (fs.existsSync(modulesDir)) {
    var events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];
    for (var e = 0; e < events.length; e++) {
      var eventDir = path.join(modulesDir, events[e]);
      if (!fs.existsSync(eventDir)) continue;
      var files = fs.readdirSync(eventDir).filter(function(f) { return f.endsWith(".js") && !f.startsWith("_"); });
      moduleCount += files.length;
      for (var f = 0; f < files.length; f++) {
        try {
          var mod = require(path.join(eventDir, files[f]));
          if (typeof mod !== "function") {
            modulesBroken.push({ event: events[e], file: files[f], error: "not a function export" });
          }
        } catch (loadErr) {
          modulesBroken.push({ event: events[e], file: files[f], error: loadErr.message });
        }
      }
    }
  }
  results.modules = { count: moduleCount, broken: modulesBroken };

  // Count cross-platform hooks
  var crossPlatformCount = allHooks.filter(function(h) { return h.validation && h.validation.crossPlatform; }).length;

  // Summary
  results.summary = {
    settingsFilesChecked: settingsFiles.length,
    settingsFilesFound: settingsFiles.filter(function(s) { return s.exists; }).length,
    totalHooks: allHooks.length,
    brokenHooks: results.broken.length,
    crossPlatformHooks: crossPlatformCount,
    hookRunnerModules: moduleCount,
    brokenModules: modulesBroken.length
  };

  return results;
}

// ============================================================
// Fix Mode
// ============================================================

function fixBrokenHooks(results) {
  var fixed = 0;
  // Group broken hooks by source file
  var bySource = {};
  for (var i = 0; i < results.broken.length; i++) {
    var h = results.broken[i];
    if (!bySource[h.source]) bySource[h.source] = [];
    bySource[h.source].push(h);
  }

  var sources = Object.keys(bySource);
  for (var s = 0; s < sources.length; s++) {
    var sourcePath = sources[s];
    try {
      var settings = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
      var changed = false;

      var events = Object.keys(settings.hooks || {});
      for (var e = 0; e < events.length; e++) {
        var event = events[e];
        var groups = settings.hooks[event];
        if (!Array.isArray(groups)) continue;

        var newGroups = [];
        for (var g = 0; g < groups.length; g++) {
          var hookList = (groups[g].hooks || []).filter(function(hook) {
            var v = validateHookCommand(hook.command || "", results.projectDir);
            if (v.error) {
              console.log("  REMOVING: [" + event + "] " + (hook.command || "").substring(0, 80));
              changed = true;
              return false;
            }
            return true;
          });
          if (hookList.length > 0) {
            groups[g].hooks = hookList;
            newGroups.push(groups[g]);
          }
        }
        settings.hooks[event] = newGroups;
        if (newGroups.length === 0) delete settings.hooks[event];
      }

      if (changed) {
        fs.writeFileSync(sourcePath, JSON.stringify(settings, null, 2) + "\n");
        console.log("  FIXED: " + sourcePath);
        fixed++;
      }
    } catch (e) {
      console.error("  ERROR fixing " + sourcePath + ": " + e.message);
    }
  }
  return fixed;
}

// ============================================================
// Output
// ============================================================

function printReport(results) {
  var projectDir = results.projectDir;
  console.log("=== Hook Diagnostics ===");
  console.log("Project: " + projectDir);
  console.log("");

  // Settings files
  console.log("Settings files (load order):");
  for (var i = 0; i < results.settingsFiles.length; i++) {
    var sf = results.settingsFiles[i];
    var status = sf.exists ? (sf.parseError ? "CORRUPT" : "OK") : "not found";
    var icon = sf.exists ? (sf.parseError ? "!!" : "++") : "--";
    console.log("  " + icon + " [" + sf.scope + "] " + sf.path);
    if (sf.parseError) console.log("     Parse error: " + sf.parseError);
  }
  console.log("");

  // Hooks
  if (results.hooks.length === 0) {
    console.log("No hooks defined.");
  } else {
    console.log("Hooks (" + results.hooks.length + "):");
    for (var j = 0; j < results.hooks.length; j++) {
      var h = results.hooks[j];
      var v = h.validation || {};
      var icon2 = v.error ? "BROKEN" : (v.crossPlatform ? "XPLAT" : (v.unparseable ? "??" : "OK"));
      console.log("  [" + icon2 + "] " + h.event + ": " + h.command.substring(0, 90));
      console.log("        Source: " + h.source + " (" + h.scope + ")");
      if (v.error) {
        console.log("        ERROR: " + v.error);
        if (v.resolved) console.log("        Expected at: " + v.resolved);
      } else if (v.crossPlatform) {
        console.log("        (Windows hook — runs on Windows Claude Code, not WSL)");
      }
    }
  }
  console.log("");

  // Broken hooks
  if (results.broken.length > 0) {
    console.log("BROKEN HOOKS (" + results.broken.length + "):");
    for (var k = 0; k < results.broken.length; k++) {
      var b = results.broken[k];
      console.log("  " + b.event + " in " + b.source);
      console.log("    Command: " + b.command.substring(0, 100));
      console.log("    Missing: " + (b.validation.resolved || "(unknown)"));
      console.log("    Fix: Edit " + b.source + " and remove this hook,");
      console.log("         or run: node diagnose.js --fix " + projectDir);
    }
    console.log("");
  }

  // Hook-runner modules
  if (results.modules) {
    console.log("Hook-runner modules: " + results.modules.count + " installed");
    if (results.modules.broken.length > 0) {
      console.log("  BROKEN MODULES (" + results.modules.broken.length + "):");
      for (var m = 0; m < results.modules.broken.length; m++) {
        var bm = results.modules.broken[m];
        console.log("    " + bm.event + "/" + bm.file + ": " + bm.error);
      }
    }
    console.log("");
  }

  // Summary
  var s = results.summary;
  var hookDetail = s.brokenHooks + " broken";
  if (s.crossPlatformHooks > 0) hookDetail += ", " + s.crossPlatformHooks + " cross-platform";
  console.log("Summary: " + s.settingsFilesFound + "/" + s.settingsFilesChecked + " settings files, " +
    s.totalHooks + " hooks (" + hookDetail + "), " +
    s.hookRunnerModules + " modules (" + s.brokenModules + " broken)");

  if (s.brokenHooks > 0) {
    console.log("\nTo auto-fix broken hooks: node diagnose.js --fix " + projectDir);
  }
}

// ============================================================
// CLI
// ============================================================

function main() {
  var args = process.argv.slice(2);
  var jsonMode = args.indexOf("--json") !== -1;
  var fixMode = args.indexOf("--fix") !== -1;

  // Find project dir argument (first non-flag arg)
  var projectDir = null;
  for (var i = 0; i < args.length; i++) {
    if (args[i].indexOf("--") !== 0 && args[i].indexOf("-") !== 0) {
      projectDir = args[i];
      break;
    }
  }
  if (!projectDir) {
    projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  }

  var results = diagnose(projectDir);

  if (fixMode && results.broken.length > 0) {
    console.log("Fixing broken hooks...");
    var fixed = fixBrokenHooks(results);
    console.log("Fixed " + fixed + " settings file(s).");
    // Re-run diagnosis
    results = diagnose(projectDir);
  }

  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printReport(results);
  }

  process.exit(results.broken.length > 0 ? 1 : 0);
}

// Export for use as module
module.exports = { diagnose: diagnose, resolveSettingsFiles: resolveSettingsFiles, fixBrokenHooks: fixBrokenHooks };

if (require.main === module) {
  main();
}
