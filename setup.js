#!/usr/bin/env node
"use strict";
/**
 * hook-runner setup wizard
 *
 * Guides the user through adopting the hook-runner modular system:
 * 1. Scans current hooks in settings.json → generates HTML report
 * 2. Shows what hook-runner would install
 * 3. Backs up existing hook files to ~/.claude/hooks/archive/
 * 4. Installs runner scripts + module dirs + updates settings.json
 * 5. Re-generates report showing the result
 *
 * Usage:
 *   node setup.js                  # full interactive wizard
 *   node setup.js --report         # just generate the report
 *   node setup.js --dry-run        # show what would change, don't do it
 *   node setup.js --install        # skip report, just install
 */
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var HOME = os.homedir();
var CLAUDE_DIR = path.join(HOME, ".claude");
var HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
var SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
var ARCHIVE_DIR = path.join(HOOKS_DIR, "archive");
var REPORT_DIR = path.join(CLAUDE_DIR, "reports");

// Source files — relative to this script
var SCRIPT_DIR = __dirname;
// When installed as a skill, runners are in the repo root.
// When run from the repo directly, they're right here.
var REPO_DIR = SCRIPT_DIR;

// ============================================================
// 1. Hook Scanner
// ============================================================

function scanHooks() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return { events: {}, totalHooks: 0, totalMatchers: 0, scripts: [] };
  }
  var settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  var hooks = settings.hooks || {};
  var events = {};
  var totalHooks = 0;
  var totalMatchers = 0;
  var scripts = [];

  var eventNames = Object.keys(hooks);
  for (var i = 0; i < eventNames.length; i++) {
    var event = eventNames[i];
    var entries = hooks[event];
    if (!Array.isArray(entries)) continue;

    events[event] = { entries: [], matchers: [], moduleCount: 0 };

    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      var matcher = entry.matcher || null;
      if (matcher && events[event].matchers.indexOf(matcher) === -1) {
        events[event].matchers.push(matcher);
        totalMatchers++;
      }

      var entryHooks = entry.hooks || [];
      for (var k = 0; k < entryHooks.length; k++) {
        var h = entryHooks[k];
        if (h.type !== "command") continue;
        totalHooks++;

        var cmd = h.command || "";
        var scriptPath = resolveScriptPath(cmd);
        var exists = scriptPath ? fs.existsSync(scriptPath) : false;
        var isRunner = scriptPath ? /run-(pretooluse|posttooluse|stop|sessionstart|userpromptsubmit)\.js$/i.test(scriptPath) : false;

        var info = {
          event: event,
          matcher: matcher,
          command: cmd,
          scriptPath: scriptPath,
          exists: exists,
          isRunner: isRunner,
          timeout: h.timeout || 10
        };

        events[event].entries.push(info);
        if (scriptPath && scripts.indexOf(scriptPath) === -1) {
          scripts.push(scriptPath);
        }

        // Count modules if this is a runner pointing to run-modules/
        if (isRunner && exists && scriptPath) {
          var modulesDir = path.join(path.dirname(scriptPath), "run-modules", event);
          if (fs.existsSync(modulesDir)) {
            try {
              var mods = fs.readdirSync(modulesDir).filter(function(f) {
                return f.endsWith(".js") && !f.startsWith(".");
              });
              events[event].moduleCount = mods.length;
            } catch (e) { /* skip */ }
          }
        }
      }
    }
  }

  return { events: events, totalHooks: totalHooks, totalMatchers: totalMatchers, scripts: scripts };
}

function resolveScriptPath(cmd) {
  // Extract script path from command like: node "$HOME/.claude/hooks/run-stop.js"
  var match = cmd.match(/["']([^"']+\.(js|sh|py))["']/);
  if (match) {
    return match[1].replace(/\$HOME/g, HOME).replace(/~/g, HOME);
  }
  // Try bare path after "node "
  var parts = cmd.split(/\s+/);
  for (var i = 0; i < parts.length; i++) {
    if (/\.(js|sh|py)$/.test(parts[i])) {
      return parts[i].replace(/\$HOME/g, HOME).replace(/~/g, HOME);
    }
  }
  return null;
}

// ============================================================
// 2. Report Generator
// ============================================================

function generateReport(scan, outputPath) {
  var now = new Date().toISOString().slice(0, 10);

  // Detect if already using hook-runner
  var usingRunner = false;
  var eventNames = Object.keys(scan.events);
  for (var i = 0; i < eventNames.length; i++) {
    var entries = scan.events[eventNames[i]].entries;
    for (var j = 0; j < entries.length; j++) {
      if (entries[j].isRunner) { usingRunner = true; break; }
    }
    if (usingRunner) break;
  }

  // Count total modules across all events
  var totalModules = 0;
  for (var m = 0; m < eventNames.length; m++) {
    totalModules += scan.events[eventNames[m]].moduleCount || 0;
  }

  var html = [];
  html.push('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">');
  html.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  html.push('<title>Claude Code Hooks Report</title>');
  html.push('<style>');
  html.push('*{margin:0;padding:0;box-sizing:border-box}');
  html.push('body{background:#0d1117;color:#c9d1d9;font-family:"Segoe UI",-apple-system,sans-serif;line-height:1.6;padding:2rem}');
  html.push('h1{color:#58a6ff;font-size:1.8rem;margin-bottom:.3rem}');
  html.push('.subtitle{color:#8b949e;font-size:.95rem;margin-bottom:2rem}');
  html.push('.stats{display:flex;gap:1.5rem;margin-bottom:2rem;flex-wrap:wrap}');
  html.push('.stat{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem 1.5rem;min-width:140px}');
  html.push('.stat-value{font-size:2rem;font-weight:700;color:#58a6ff}');
  html.push('.stat-label{font-size:.8rem;color:#8b949e;text-transform:uppercase;letter-spacing:.05em}');
  html.push('.event-section{margin-bottom:1.5rem}');
  html.push('.event-header{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem 1.5rem;cursor:pointer;display:flex;align-items:center;gap:1rem}');
  html.push('.event-header:hover{background:#1c2128}');
  html.push('.event-badge{font-size:.75rem;font-weight:600;padding:.2rem .6rem;border-radius:4px;text-transform:uppercase}');
  html.push('.badge-session{background:#1f6feb33;color:#58a6ff;border:1px solid #1f6feb}');
  html.push('.badge-pre{background:#da363333;color:#f85149;border:1px solid #da3633}');
  html.push('.badge-post{background:#23863633;color:#3fb950;border:1px solid #238636}');
  html.push('.badge-stop{background:#9e6a0333;color:#d29922;border:1px solid #9e6a03}');
  html.push('.badge-prompt{background:#8b5cf633;color:#a78bfa;border:1px solid #7c3aed}');
  html.push('.event-title{font-size:1.1rem;font-weight:600;color:#c9d1d9}');
  html.push('.event-meta{margin-left:auto;color:#8b949e;font-size:.85rem}');
  html.push('.chevron{color:#484f58;transition:transform .2s;font-size:1.2rem}');
  html.push('.chevron.open{transform:rotate(90deg)}');
  html.push('.event-body{background:#0d1117;border:1px solid #30363d;border-top:none;border-radius:0 0 8px 8px;display:none}');
  html.push('.event-body.open{display:block}');
  html.push('.hook-entry{padding:1rem 1.5rem;border-bottom:1px solid #21262d}');
  html.push('.hook-entry:last-child{border-bottom:none}');
  html.push('.hook-label{color:#8b949e;font-size:.8rem;text-transform:uppercase;margin-bottom:.3rem}');
  html.push('.hook-path{color:#79c0ff;font-family:"Cascadia Code","Fira Code",monospace;font-size:.85rem}');
  html.push('.hook-path.missing{color:#f85149;text-decoration:line-through}');
  html.push('.matcher{background:#1f2937;border:1px solid #30363d;border-radius:4px;padding:.15rem .5rem;font-size:.8rem;color:#d2a8ff;font-family:monospace;display:inline-block;margin:.2rem}');
  html.push('.status-badge{display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;font-weight:600}');
  html.push('.status-runner{background:#23863633;color:#3fb950;border:1px solid #238636}');
  html.push('.status-standalone{background:#9e6a0333;color:#d29922;border:1px solid #9e6a03}');
  html.push('.status-missing{background:#da363333;color:#f85149;border:1px solid #da3633}');
  html.push('.module-list{padding:.5rem 1.5rem 1rem}');
  html.push('.module-item{display:flex;align-items:center;gap:.5rem;padding:.3rem 0}');
  html.push('.module-dot{width:8px;height:8px;border-radius:50%;background:#3fb950;flex-shrink:0}');
  html.push('.module-name{color:#c9d1d9;font-size:.9rem;font-family:monospace}');
  html.push('.arch-note{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;margin-bottom:2rem}');
  html.push('.arch-note h2{color:#d2a8ff;font-size:1rem;margin-bottom:.8rem}');
  html.push('.arch-note p{color:#8b949e;font-size:.9rem;margin-bottom:.5rem}');
  html.push('.arch-note code{background:#0d1117;padding:.1rem .4rem;border-radius:3px;color:#79c0ff;font-size:.85rem}');
  html.push('.footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #21262d;color:#484f58;font-size:.8rem;text-align:center}');
  html.push('</style></head><body>');

  html.push('<h1>Claude Code Hooks Report</h1>');
  html.push('<p class="subtitle">Hook configuration analysis &mdash; generated ' + now + '</p>');

  // Stats
  html.push('<div class="stats">');
  html.push('<div class="stat"><div class="stat-value">' + eventNames.length + '</div><div class="stat-label">Hook Events</div></div>');
  html.push('<div class="stat"><div class="stat-value">' + scan.totalHooks + '</div><div class="stat-label">Hook Entries</div></div>');
  html.push('<div class="stat"><div class="stat-value">' + scan.totalMatchers + '</div><div class="stat-label">Matchers</div></div>');
  if (totalModules > 0) {
    html.push('<div class="stat"><div class="stat-value">' + totalModules + '</div><div class="stat-label">Modules</div></div>');
  }
  html.push('<div class="stat"><div class="stat-value">' + (usingRunner ? 'Yes' : 'No') + '</div><div class="stat-label">Hook Runner</div></div>');
  html.push('</div>');

  // Architecture note
  if (usingRunner) {
    html.push('<div class="arch-note"><h2>Architecture: Runner + Module Pattern</h2>');
    html.push('<p>Each hook event has <strong>one runner script</strong> in <code>settings.json</code>. The runner auto-loads all <code>.js</code> modules from <code>run-modules/{Event}/</code>, sorted alphabetically.</p>');
    html.push('<p>To add behavior: create a new module file. Never add new hook entries to settings.json.</p>');
    html.push('</div>');
  } else {
    html.push('<div class="arch-note"><h2>Current: Standalone Hook Scripts</h2>');
    html.push('<p>Each hook entry in <code>settings.json</code> points to an individual script. Adding new hooks requires editing settings.json.</p>');
    html.push('<p><strong>hook-runner</strong> replaces this with a modular system: one runner per event, modules in folders. <code>node setup.js</code> to migrate.</p>');
    html.push('</div>');
  }

  // Event badges
  var badgeClass = {
    SessionStart: "badge-session", PreToolUse: "badge-pre", PostToolUse: "badge-post",
    Stop: "badge-stop", UserPromptSubmit: "badge-prompt"
  };

  // Events
  for (var e = 0; e < eventNames.length; e++) {
    var evt = eventNames[e];
    var evtData = scan.events[evt];
    var badge = badgeClass[evt] || "badge-session";
    var metaParts = [];
    metaParts.push(evtData.entries.length + " hook" + (evtData.entries.length !== 1 ? "s" : ""));
    if (evtData.matchers.length > 0) metaParts.push(evtData.matchers.join(", "));
    if (evtData.moduleCount > 0) metaParts.push(evtData.moduleCount + " modules");

    html.push('<div class="event-section">');
    html.push('<div class="event-header" onclick="toggleEvent(this)">');
    html.push('<span class="chevron">&#9654;</span>');
    html.push('<span class="event-badge ' + badge + '">' + evt + '</span>');
    html.push('<span class="event-title">' + getEventTitle(evt) + '</span>');
    html.push('<span class="event-meta">' + metaParts.join(' &bull; ') + '</span>');
    html.push('</div>');
    html.push('<div class="event-body">');

    for (var h = 0; h < evtData.entries.length; h++) {
      var hook = evtData.entries[h];
      html.push('<div class="hook-entry">');

      // Status badge
      var statusClass = hook.isRunner ? "status-runner" : (hook.exists ? "status-standalone" : "status-missing");
      var statusText = hook.isRunner ? "RUNNER" : (hook.exists ? "STANDALONE" : "MISSING");
      html.push('<span class="status-badge ' + statusClass + '">' + statusText + '</span>');

      if (hook.matcher) {
        html.push(' <span class="matcher">' + escHtml(hook.matcher) + '</span>');
      }

      html.push('<div class="hook-label">Command</div>');
      html.push('<div class="hook-path' + (hook.exists ? '' : ' missing') + '">' + escHtml(hook.command) + '</div>');

      if (hook.scriptPath) {
        html.push('<div class="hook-label">Script Path</div>');
        html.push('<div class="hook-path' + (hook.exists ? '' : ' missing') + '">' + escHtml(hook.scriptPath) + '</div>');
      }

      html.push('</div>');
    }

    // Show modules if runner
    if (evtData.moduleCount > 0) {
      var modulesDir = null;
      for (var mh = 0; mh < evtData.entries.length; mh++) {
        if (evtData.entries[mh].isRunner && evtData.entries[mh].scriptPath) {
          modulesDir = path.join(path.dirname(evtData.entries[mh].scriptPath), "run-modules", evt);
          break;
        }
      }
      if (modulesDir && fs.existsSync(modulesDir)) {
        html.push('<div class="module-list">');
        html.push('<div class="hook-label">Modules (' + evt + ')</div>');
        var modFiles = fs.readdirSync(modulesDir).filter(function(f) { return f.endsWith(".js"); }).sort();
        for (var mf = 0; mf < modFiles.length; mf++) {
          html.push('<div class="module-item"><div class="module-dot"></div><span class="module-name">' + escHtml(modFiles[mf]) + '</span></div>');
        }
        // Check for project-scoped subdirs
        var subdirs = fs.readdirSync(modulesDir).filter(function(f) {
          return fs.statSync(path.join(modulesDir, f)).isDirectory() && f !== "archive";
        });
        for (var sd = 0; sd < subdirs.length; sd++) {
          var subMods = fs.readdirSync(path.join(modulesDir, subdirs[sd])).filter(function(f) { return f.endsWith(".js"); }).sort();
          for (var sm = 0; sm < subMods.length; sm++) {
            html.push('<div class="module-item"><div class="module-dot" style="background:#d2a8ff"></div><span class="module-name">' + escHtml(subdirs[sd] + '/' + subMods[sm]) + '</span></div>');
          }
        }
        html.push('</div>');
      }
    }

    html.push('</div></div>');
  }

  // Footer
  html.push('<div class="footer">Generated by hook-runner setup.js &mdash; ' + now + '</div>');

  // JavaScript
  html.push('<script>');
  html.push('function toggleEvent(el){var b=el.nextElementSibling;var c=el.querySelector(".chevron");b.classList.toggle("open");c.classList.toggle("open")}');
  html.push('</script>');
  html.push('</body></html>');

  var content = html.join("\n");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf-8");
  return outputPath;
}

function getEventTitle(event) {
  var titles = {
    SessionStart: "Session Initialization",
    PreToolUse: "Pre-Execution Gates",
    PostToolUse: "Post-Execution Checks",
    Stop: "Stop Response Control",
    UserPromptSubmit: "Prompt Processing"
  };
  return titles[event] || event;
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ============================================================
// 3. Backup Engine
// ============================================================

function backupHooks(scan) {
  var ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  var backupDir = path.join(ARCHIVE_DIR, "backup-" + ts);
  fs.mkdirSync(backupDir, { recursive: true });

  var manifest = {
    timestamp: ts,
    platform: process.platform,
    backupDir: backupDir,
    files: [],
    settingsHooks: null
  };

  // Backup settings.json hooks section
  if (fs.existsSync(SETTINGS_PATH)) {
    var settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    manifest.settingsHooks = settings.hooks || {};
    fs.writeFileSync(
      path.join(backupDir, "hooks-backup.json"),
      JSON.stringify(settings.hooks || {}, null, 2),
      "utf-8"
    );
    // Also backup full settings.json
    fs.copyFileSync(SETTINGS_PATH, path.join(backupDir, "settings.json"));
    manifest.files.push({ original: SETTINGS_PATH, backed: "settings.json" });
  }

  // Backup each script file referenced in hooks
  for (var i = 0; i < scan.scripts.length; i++) {
    var src = scan.scripts[i];
    if (!fs.existsSync(src)) continue;
    var name = path.basename(src);
    // Avoid name collisions
    var destName = name;
    var counter = 1;
    while (fs.existsSync(path.join(backupDir, destName))) {
      destName = name.replace(/\.js$/, "-" + counter + ".js");
      counter++;
    }
    fs.copyFileSync(src, path.join(backupDir, destName));
    manifest.files.push({ original: src, backed: destName });
  }

  // Backup existing run-modules if they exist
  var runModulesDir = path.join(HOOKS_DIR, "run-modules");
  if (fs.existsSync(runModulesDir)) {
    var rmBackup = path.join(backupDir, "run-modules");
    copyDirRecursive(runModulesDir, rmBackup);
    manifest.files.push({ original: runModulesDir, backed: "run-modules/" });
  }

  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );

  return { backupDir: backupDir, manifest: manifest };
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  var entries = fs.readdirSync(src, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var srcPath = path.join(src, entries[i].name);
    var destPath = path.join(dest, entries[i].name);
    if (entries[i].isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ============================================================
// 4. Installer
// ============================================================

function installRunners(dryRun) {
  var changes = [];

  // Ensure hooks dir exists
  if (!dryRun) fs.mkdirSync(HOOKS_DIR, { recursive: true });

  // Copy runner scripts + load-modules.js
  var runnerFiles = ["run-pretooluse.js", "run-posttooluse.js", "run-stop.js", "run-sessionstart.js", "load-modules.js"];
  for (var i = 0; i < runnerFiles.length; i++) {
    var src = path.join(REPO_DIR, runnerFiles[i]);
    var dest = path.join(HOOKS_DIR, runnerFiles[i]);
    if (!fs.existsSync(src)) {
      changes.push({ action: "skip", file: runnerFiles[i], reason: "source not found" });
      continue;
    }
    if (!dryRun) fs.copyFileSync(src, dest);
    changes.push({ action: dryRun ? "would-copy" : "copied", file: runnerFiles[i], dest: dest });
  }

  // Create run-modules directories
  var eventDirs = ["PreToolUse", "PostToolUse", "Stop", "SessionStart"];
  for (var j = 0; j < eventDirs.length; j++) {
    var dir = path.join(HOOKS_DIR, "run-modules", eventDirs[j]);
    if (!fs.existsSync(dir)) {
      if (!dryRun) fs.mkdirSync(dir, { recursive: true });
      changes.push({ action: dryRun ? "would-create" : "created", file: "run-modules/" + eventDirs[j] + "/" });
    } else {
      changes.push({ action: "exists", file: "run-modules/" + eventDirs[j] + "/" });
    }
  }

  // Update settings.json
  var settingsChanges = updateSettings(dryRun);
  changes = changes.concat(settingsChanges);

  return changes;
}

function updateSettings(dryRun) {
  var changes = [];
  var settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  }

  if (!settings.hooks) settings.hooks = {};

  // Define the hook-runner settings.json entries
  var runnerConfig = {
    SessionStart: [
      { hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-sessionstart.js"', timeout: 5 }] }
    ],
    Stop: [
      { hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-stop.js"', timeout: 5 }] }
    ],
    PreToolUse: [
      { matcher: "Edit", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-pretooluse.js"', timeout: 5 }] },
      { matcher: "Write", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-pretooluse.js"', timeout: 5 }] },
      { matcher: "Bash", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-pretooluse.js"', timeout: 5 }] }
    ],
    PostToolUse: [
      { matcher: "Write", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-posttooluse.js"', timeout: 5 }] },
      { matcher: "Edit", hooks: [{ type: "command", command: 'node "$HOME/.claude/hooks/run-posttooluse.js"', timeout: 5 }] }
    ]
  };

  // Preserve existing matchers the user has that we don't define
  var existingEvents = Object.keys(settings.hooks);
  for (var i = 0; i < existingEvents.length; i++) {
    var evt = existingEvents[i];
    if (!runnerConfig[evt]) {
      // Unknown event — check if it's already a runner, preserve if so
      var entries = settings.hooks[evt];
      if (Array.isArray(entries)) {
        var hasRunner = false;
        for (var j = 0; j < entries.length; j++) {
          var h = (entries[j].hooks || [])[0] || {};
          if (h.command && /run-\w+\.js/.test(h.command)) hasRunner = true;
        }
        if (!hasRunner) {
          // Create a runner entry for this unknown event
          var runnerName = "run-" + evt.toLowerCase() + ".js";
          changes.push({ action: "note", file: evt, reason: "custom event — preserving existing config" });
        }
      }
    }
  }

  settings.hooks = runnerConfig;
  changes.push({ action: dryRun ? "would-update" : "updated", file: "settings.json hooks section" });

  if (!dryRun) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  }

  return changes;
}

// ============================================================
// 5. Preview
// ============================================================

function printPreview(scan) {
  console.log("");
  console.log("=== hook-runner: What Will Change ===");
  console.log("");
  console.log("CURRENT:");
  var eventNames = Object.keys(scan.events);
  if (eventNames.length === 0) {
    console.log("  No hooks configured in settings.json");
  } else {
    for (var i = 0; i < eventNames.length; i++) {
      var evt = scan.events[eventNames[i]];
      var desc = eventNames[i] + ": " + evt.entries.length + " hook(s)";
      if (evt.matchers.length > 0) desc += " [" + evt.matchers.join(", ") + "]";
      if (evt.entries[0] && evt.entries[0].isRunner) desc += " (already runner)";
      console.log("  " + desc);
    }
  }

  console.log("");
  console.log("AFTER hook-runner installation:");
  console.log("  ~/.claude/hooks/");
  console.log("    load-modules.js          # shared module loader");
  console.log("    run-pretooluse.js         # PreToolUse runner");
  console.log("    run-posttooluse.js        # PostToolUse runner");
  console.log("    run-stop.js               # Stop runner");
  console.log("    run-sessionstart.js       # SessionStart runner");
  console.log("    run-modules/");
  console.log("      PreToolUse/*.js         # gate modules (block/allow)");
  console.log("      PostToolUse/*.js        # check modules");
  console.log("      Stop/*.js               # stop-control modules");
  console.log("      SessionStart/*.js       # context-injection modules");
  console.log("");
  console.log("  settings.json hooks → one entry per event+matcher, all pointing to runners");
  console.log("");
  console.log("BACKUP:");
  console.log("  All existing hook files → ~/.claude/hooks/archive/backup-<timestamp>/");
  console.log("  Includes: settings.json, all referenced scripts, run-modules/");
  console.log("");
}

// ============================================================
// 6. Main Orchestrator
// ============================================================

function openFile(filePath) {
  try {
    if (process.platform === "win32") {
      cp.execSync('start "" "' + filePath + '"', { stdio: "ignore" });
    } else if (process.platform === "darwin") {
      cp.execSync('open "' + filePath + '"', { stdio: "ignore" });
    } else {
      cp.execSync('xdg-open "' + filePath + '"', { stdio: "ignore" });
    }
  } catch (e) { /* ignore */ }
}

function main() {
  var args = process.argv.slice(2);
  var reportOnly = args.indexOf("--report") !== -1;
  var dryRun = args.indexOf("--dry-run") !== -1;
  var installOnly = args.indexOf("--install") !== -1;

  console.log("[hook-runner] Setup Wizard");
  console.log("========================");

  // Step 1: Scan
  console.log("[1/5] Scanning current hooks...");
  var scan = scanHooks();
  var eventNames = Object.keys(scan.events);
  console.log("  Found " + scan.totalHooks + " hook(s) across " + eventNames.length + " event(s)");

  // Step 2: Generate "before" report
  console.log("[2/5] Generating hooks report...");
  var beforeReport = path.join(REPORT_DIR, "hooks-report-before.html");
  generateReport(scan, beforeReport);
  console.log("  Report: " + beforeReport);
  openFile(beforeReport);

  if (reportOnly) {
    console.log("\n[hook-runner] Report-only mode. Done.");
    return;
  }

  // Step 3: Preview
  printPreview(scan);

  if (dryRun) {
    console.log("[hook-runner] Dry-run mode. Showing what would change...");
    var dryChanges = installRunners(true);
    for (var d = 0; d < dryChanges.length; d++) {
      console.log("  " + dryChanges[d].action + ": " + dryChanges[d].file);
    }
    console.log("\n[hook-runner] Dry-run complete. No changes made.");
    return;
  }

  // Step 4: Backup
  console.log("[3/5] Backing up existing hooks...");
  var backup = backupHooks(scan);
  console.log("  Backed up " + backup.manifest.files.length + " file(s)");
  console.log("  Archive: " + backup.backupDir);

  // Step 5: Install
  console.log("[4/5] Installing hook-runner...");
  var changes = installRunners(false);
  for (var c = 0; c < changes.length; c++) {
    var ch = changes[c];
    console.log("  " + ch.action + ": " + ch.file + (ch.reason ? " (" + ch.reason + ")" : ""));
  }

  // Step 6: Verify — re-scan and generate "after" report
  console.log("[5/5] Verifying installation...");
  var afterScan = scanHooks();
  var afterReport = path.join(REPORT_DIR, "hooks-report.html");
  generateReport(afterScan, afterReport);
  console.log("  Report: " + afterReport);
  openFile(afterReport);

  // Summary
  console.log("");
  console.log("============================================");
  console.log("[hook-runner] Installation Complete");
  console.log("============================================");
  console.log("  Runners installed: ~/.claude/hooks/run-*.js");
  console.log("  Module dirs: ~/.claude/hooks/run-modules/{Event}/");
  console.log("  Backup: " + backup.backupDir);
  console.log("  Report: " + afterReport);
  console.log("");
  console.log("  To add a hook module:");
  console.log("    Create ~/.claude/hooks/run-modules/<Event>/my-module.js");
  console.log("    Export: module.exports = function(input) { return null; }");
  console.log("");
  console.log("  To restore original hooks:");
  console.log("    cp " + backup.backupDir + "/settings.json ~/.claude/settings.json");
  console.log("============================================");
}

module.exports = { scanHooks: scanHooks, generateReport: generateReport, backupHooks: backupHooks, installRunners: installRunners };

if (require.main === module) main();
