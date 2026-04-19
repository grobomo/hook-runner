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
 *   node setup.js --sync           # sync modules from GitHub per modules.yaml
 *   node setup.js --sync --dry-run # preview sync without installing
 *   node setup.js --stats           # quick text summary of hook log
 *   node setup.js --list            # show catalog vs installed modules
 *   node setup.js --test            # run all test suites
 *   node setup.js --uninstall       # remove hook-runner from system
 *   node setup.js --uninstall --dry-run  # preview uninstall
 *   node setup.js --uninstall --force    # also remove non-empty module dirs
 *   node setup.js --prune 7        # prune log entries older than 7 days
 *   node setup.js --prune 7 --dry-run
 *   node setup.js --version        # show version
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

var HOOK_LOG_PATH = path.join(HOOKS_DIR, "hook-log.jsonl");
var VERSION = require(path.join(__dirname, "package.json")).version;

// Shared file lists — single source of truth (see constants.js)
var RUNNER_FILES = require(path.join(__dirname, "constants.js")).RUNNER_FILES;

// Safe settings.json reader — returns {} on corrupt/missing file
function readSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  } catch (e) {
    console.error("WARNING: " + SETTINGS_PATH + " is corrupt — " + e.message);
    return {};
  }
}

// ============================================================
// 0. Hook Log Stats
// ============================================================

/**
 * Parse log lines into stats object.
 */
function parseLogLines(lines, stats, maxSamples) {
  for (var i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var entry;
    try { entry = JSON.parse(lines[i]); } catch(e) { continue; }

    var key = entry.event + "/" + entry.module;
    if (!stats[key]) {
      stats[key] = { total: 0, pass: 0, block: 0, error: 0, text: 0, deny: 0, msTotal: 0, msCount: 0, msMax: 0, samples: [], firstTs: "", lastTs: "", lastBlockTs: "" };
    }
    var s = stats[key];
    s.total++;
    var ts = entry.ts || "";
    if (ts && (!s.firstTs || ts < s.firstTs)) s.firstTs = ts;
    if (ts && ts > s.lastTs) s.lastTs = ts;
    var r = entry.result || "pass";
    if (r === "pass") s.pass++;
    else if (r === "block") { s.block++; if (ts > s.lastBlockTs) s.lastBlockTs = ts; }
    else if (r === "deny") { s.block++; s.deny++; if (ts > s.lastBlockTs) s.lastBlockTs = ts; }
    else if (r === "error") s.error++;
    else if (r === "text") s.text++;

    if (typeof entry.ms === "number") {
      s.msTotal += entry.ms;
      s.msCount++;
      if (entry.ms > s.msMax) s.msMax = entry.ms;
    }

    if (r !== "pass" && r !== "text" && s.samples.length < maxSamples) {
      s.samples.push({
        ts: entry.ts || "", result: r, tool: entry.tool || "",
        cmd: entry.cmd || "", file: entry.file || "",
        reason: entry.reason || "", project: entry.project || "",
      });
    }
  }
}

/**
 * Read hook-log.jsonl (and rotated .1 file) and compute per-module stats.
 * Returns: { "PreToolUse/enforcement-gate": { total: 100, pass: 90, block: 8, error: 2, samples: [...] }, ... }
 */
function readHookStats(maxSamples) {
  maxSamples = maxSamples || 5;
  var stats = {};

  // Read rotated log first (older entries) so samples are chronological
  var rotatedPath = HOOK_LOG_PATH + ".1";
  if (fs.existsSync(rotatedPath)) {
    try {
      var rotated = fs.readFileSync(rotatedPath, "utf-8").split("\n");
      parseLogLines(rotated, stats, maxSamples);
    } catch(e) { /* skip */ }
  }

  if (!fs.existsSync(HOOK_LOG_PATH)) return stats;
  try {
    var current = fs.readFileSync(HOOK_LOG_PATH, "utf-8").split("\n");
    parseLogLines(current, stats, maxSamples);
  } catch(e) { /* skip */ }

  return stats;
}

/**
 * Prune hook log — keep only entries from the last N days.
 * @param {number} days - keep entries newer than this many days
 * @param {boolean} dryRun - if true, just report what would be pruned
 * @returns {{ kept: number, pruned: number, rotatedRemoved: boolean }}
 */
function pruneLog(days, dryRun) {
  var cutoff = new Date(Date.now() - days * 86400000).toISOString();
  var result = { kept: 0, pruned: 0, rotatedRemoved: false };

  // Remove rotated log entirely (it's always older)
  var rotatedPath = HOOK_LOG_PATH + ".1";
  if (fs.existsSync(rotatedPath)) {
    try {
      var rotLines = fs.readFileSync(rotatedPath, "utf-8").split("\n");
      result.pruned += rotLines.filter(function(l) { return l.trim(); }).length;
      result.rotatedRemoved = true;
      if (!dryRun) fs.unlinkSync(rotatedPath);
    } catch(e) { /* skip */ }
  }

  if (!fs.existsSync(HOOK_LOG_PATH)) return result;
  try {
    var lines = fs.readFileSync(HOOK_LOG_PATH, "utf-8").split("\n");
    var kept = [];
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try {
        var entry = JSON.parse(lines[i]);
        if (entry.ts && entry.ts >= cutoff) {
          kept.push(lines[i]);
          result.kept++;
        } else {
          result.pruned++;
        }
      } catch(e) { result.pruned++; }
    }
    if (!dryRun) fs.writeFileSync(HOOK_LOG_PATH, kept.join("\n") + (kept.length ? "\n" : ""));
  } catch(e) { /* skip */ }

  return result;
}

// ============================================================
// 1. Hook Scanner
// ============================================================

function scanHooks() {
  var settings = readSettings();
  if (!settings.hooks) {
    return { events: {}, totalHooks: 0, totalMatchers: 0, scripts: [] };
  }
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
        // T416: run-hidden.js wrapper means scriptPath resolves to run-hidden.js, not the actual runner.
        // Check both the resolved path and the full command string for the runner pattern.
        var runnerPattern = /run-(pretooluse|posttooluse|stop|sessionstart|userpromptsubmit)\.js/i;
        var isRunner = scriptPath ? runnerPattern.test(scriptPath) || runnerPattern.test(cmd) : false;

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
                return f.slice(-3) === ".js" && f.charAt(0) !== ".";
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
  // T416: For run-hidden.js wrapper commands like: node "...run-hidden.js" run-stop.js
  // collect all .js paths and prefer the actual runner over the wrapper.
  var allPaths = [];
  var re = /["']([^"']+\.(js|sh|py))["']/g;
  var m;
  while ((m = re.exec(cmd)) !== null) allPaths.push(m[1]);
  var parts = cmd.split(/\s+/);
  for (var pi = 0; pi < parts.length; pi++) {
    var p = parts[pi].replace(/^["']|["']$/g, "");
    if (/\.(js|sh|py)$/.test(p) && allPaths.indexOf(p) === -1) allPaths.push(p);
  }
  if (allPaths.length === 0) return null;
  // Prefer the actual runner over run-hidden.js wrapper
  var runnerRe = /run-(pretooluse|posttooluse|stop|sessionstart|userpromptsubmit)\.js$/i;
  // Find the wrapper's directory (first quoted full path) to resolve bare runner names
  var wrapperDir = "";
  for (var wi = 0; wi < allPaths.length; wi++) {
    var resolved = allPaths[wi].replace(/\$HOME/g, HOME).replace(/~/g, HOME);
    if (resolved.indexOf("/") !== -1 || resolved.indexOf("\\") !== -1) {
      wrapperDir = path.dirname(resolved);
      break;
    }
  }
  for (var ri = 0; ri < allPaths.length; ri++) {
    if (runnerRe.test(allPaths[ri])) {
      var rp = allPaths[ri].replace(/\$HOME/g, HOME).replace(/~/g, HOME);
      // If bare name (no directory), resolve relative to wrapper dir
      if (wrapperDir && rp.indexOf("/") === -1 && rp.indexOf("\\") === -1) {
        rp = path.join(wrapperDir, rp);
      }
      return rp;
    }
  }
  return null;
}

// ============================================================
// 2. Report Generator (extracted to report.js)
// ============================================================
var reportModule = require("./report");
var generateReport = reportModule.generateReport;
var collectModules = reportModule.collectModules;
var getModuleDescription = reportModule.getModuleDescription;
var EVENT_ORDER = reportModule.EVENT_ORDER;

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
  var settings = readSettings();
  if (Object.keys(settings).length > 0) {
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
  for (var i = 0; i < RUNNER_FILES.length; i++) {
    var src = path.join(REPO_DIR, RUNNER_FILES[i]);
    var dest = path.join(HOOKS_DIR, RUNNER_FILES[i]);
    if (!fs.existsSync(src)) {
      changes.push({ action: "skip", file: RUNNER_FILES[i], reason: "source not found" });
      continue;
    }
    if (!dryRun) fs.copyFileSync(src, dest);
    changes.push({ action: dryRun ? "would-copy" : "copied", file: RUNNER_FILES[i], dest: dest });
  }

  // Create run-modules directories
  var eventDirs = ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];
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
  var settings = readSettings();
  if (!settings.hooks) settings.hooks = {};

  // T387/T393: On Windows, use run-hidden.js wrapper to prevent console window focus steal.
  // T393: Use fully-resolved paths on Windows to avoid $HOME shell expansion which
  // forces cmd.exe (visible popup). With resolved paths, Claude Code can spawn node
  // directly without a shell wrapper.
  var isWin = process.platform === "win32";
  function hookCmd(runner) {
    if (isWin) {
      // Resolve path so no shell expansion ($HOME) is needed — avoids cmd.exe popup
      var hooksDir = path.join(os.homedir(), ".claude", "hooks").replace(/\\/g, "/");
      return 'node "' + hooksDir + '/run-hidden.js" ' + runner;
    }
    return 'node "$HOME/.claude/hooks/' + runner + '"';
  }

  // Define the hook-runner settings.json entries
  var runnerConfig = {
    SessionStart: [
      { hooks: [{ type: "command", command: hookCmd("run-sessionstart.js"), timeout: 5 }] }
    ],
    Stop: [
      { hooks: [{ type: "command", command: hookCmd("run-stop.js"), timeout: 5 }] }
    ],
    PreToolUse: [
      { matcher: "Edit", hooks: [{ type: "command", command: hookCmd("run-pretooluse.js"), timeout: 5 }] },
      { matcher: "Write", hooks: [{ type: "command", command: hookCmd("run-pretooluse.js"), timeout: 5 }] },
      { matcher: "Bash", hooks: [{ type: "command", command: hookCmd("run-pretooluse.js"), timeout: 5 }] }
    ],
    PostToolUse: [
      { matcher: "Write", hooks: [{ type: "command", command: hookCmd("run-posttooluse.js"), timeout: 5 }] },
      { matcher: "Edit", hooks: [{ type: "command", command: hookCmd("run-posttooluse.js"), timeout: 5 }] }
    ],
    UserPromptSubmit: [
      { hooks: [{ type: "command", command: hookCmd("run-userpromptsubmit.js"), timeout: 5 }] }
    ]
  };

  // Preserve custom events that hook-runner doesn't define
  var existingEvents = Object.keys(settings.hooks);
  for (var i = 0; i < existingEvents.length; i++) {
    var evt = existingEvents[i];
    if (!runnerConfig[evt]) {
      // Custom event — preserve its existing config
      runnerConfig[evt] = settings.hooks[evt];
      changes.push({ action: "preserved", file: evt, reason: "custom event — kept existing config" });
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
// 6. Module Sync (fetch from GitHub per modules.yaml)
// ============================================================

var MODULES_YAML_PATH = path.join(HOOKS_DIR, "modules.yaml");
var DEFAULT_SOURCE = "grobomo/hook-runner";
var DEFAULT_BRANCH = "main";

/**
 * Minimal YAML parser for modules.yaml format.
 * Handles: top-level scalars, nested keys (one level), list items (- value).
 */
function parseModulesYaml(content) {
  var result = { source: DEFAULT_SOURCE, branch: DEFAULT_BRANCH, modules: {}, project_modules: {} };
  var lines = content.split("\n");
  var currentSection = null;
  var currentEvent = null;
  var currentProject = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.replace(/\s+$/, "");
    if (/^\s*#/.test(trimmed) || /^\s*$/.test(trimmed)) continue;

    // Top-level scalar: source: value, branch: value
    var scalarMatch = trimmed.match(/^(\w+):\s+(.+)/);
    if (scalarMatch) {
      var key = scalarMatch[1];
      var val = scalarMatch[2].trim();
      if (key === "source") { result.source = val; continue; }
      if (key === "branch") { result.branch = val; continue; }
    }

    // Section headers
    if (/^modules:\s*$/.test(trimmed)) { currentSection = "modules"; currentEvent = null; currentProject = null; continue; }
    if (/^project_modules:\s*$/.test(trimmed)) { currentSection = "project_modules"; currentEvent = null; currentProject = null; continue; }

    // Event key under modules (2-space indent): "  PreToolUse:"
    var eventMatch = trimmed.match(/^  (\w+):\s*$/);
    if (eventMatch && currentSection === "modules") {
      currentEvent = eventMatch[1];
      if (!result.modules[currentEvent]) result.modules[currentEvent] = [];
      currentProject = null;
      continue;
    }

    // Project key under project_modules (2-space indent)
    var projMatch = trimmed.match(/^  ([\w-]+):\s*$/);
    if (projMatch && currentSection === "project_modules") {
      currentProject = projMatch[1];
      if (!result.project_modules[currentProject]) result.project_modules[currentProject] = {};
      currentEvent = null;
      continue;
    }

    // Event key under project (4-space indent)
    var projEventMatch = trimmed.match(/^    (\w+):\s*$/);
    if (projEventMatch && currentSection === "project_modules" && currentProject) {
      currentEvent = projEventMatch[1];
      if (!result.project_modules[currentProject][currentEvent]) result.project_modules[currentProject][currentEvent] = [];
      continue;
    }

    // List item under modules event (4-space indent): "    - module-name"
    var listMatch = trimmed.match(/^    -\s+([\w\/_-]+)/);
    if (listMatch && currentSection === "modules" && currentEvent) {
      result.modules[currentEvent].push(listMatch[1]);
      continue;
    }

    // List item under project_modules event (6-space indent)
    var projListMatch = trimmed.match(/^      -\s+([\w\/_-]+)/);
    if (projListMatch && currentSection === "project_modules" && currentProject && currentEvent) {
      result.project_modules[currentProject][currentEvent].push(projListMatch[1]);
      continue;
    }
  }

  return result;
}

/**
 * Fetch a file from GitHub raw content via curl.
 */
function fetchFromGitHub(source, branch, filePath) {
  // Sanitize inputs to prevent command injection via modules.yaml
  var safe = /^[a-zA-Z0-9._\-\/]+$/;
  if (![source, branch, filePath].every(function(s) { return safe.test(s); })) {
    console.log("  [WARN] Invalid characters in GitHub path, skipping");
    return null;
  }
  var url = "https://raw.githubusercontent.com/" + source + "/" + branch + "/" + filePath;
  try {
    return cp.execSync('curl -fsSL "' + url + '"', { encoding: "utf-8", timeout: 15000 });
  } catch (e) {
    return null;
  }
}

/**
 * Sync modules from GitHub per modules.yaml config.
 * @param {boolean} dryRun - if true, just show what would happen
 * @returns {Array} list of changes
 */
function syncModules(dryRun) {
  var changes = [];

  if (!fs.existsSync(MODULES_YAML_PATH)) {
    console.log("  No modules.yaml found at " + MODULES_YAML_PATH);
    console.log("  Create one from the example:");
    console.log("    curl -fsSL https://raw.githubusercontent.com/" + DEFAULT_SOURCE + "/" + DEFAULT_BRANCH + "/modules.example.yaml > \"" + MODULES_YAML_PATH + "\"");
    return changes;
  }

  var config = parseModulesYaml(fs.readFileSync(MODULES_YAML_PATH, "utf-8"));
  console.log("  Source: " + config.source + " (branch: " + config.branch + ")");

  // Sync global modules
  var events = Object.keys(config.modules);
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    var moduleNames = config.modules[event];
    var targetDir = path.join(HOOKS_DIR, "run-modules", event);
    if (!dryRun) fs.mkdirSync(targetDir, { recursive: true });

    for (var j = 0; j < moduleNames.length; j++) {
      var modName = moduleNames[j];
      var remotePath = "modules/" + event + "/" + modName + ".js";
      var localPath = path.join(targetDir, modName + ".js");
      var existing = fs.existsSync(localPath) ? fs.readFileSync(localPath, "utf-8") : null;

      process.stdout.write("  " + event + "/" + modName + ".js ... ");
      var content = fetchFromGitHub(config.source, config.branch, remotePath);

      if (!content) {
        changes.push({ action: "error", file: event + "/" + modName + ".js", reason: "not found in repo" });
        console.log("NOT FOUND");
        continue;
      }
      if (existing === content) {
        changes.push({ action: "up-to-date", file: event + "/" + modName + ".js" });
        console.log("up to date");
        continue;
      }
      if (!dryRun) fs.writeFileSync(localPath, content);
      var action = dryRun ? "would-" + (existing ? "update" : "install") : (existing ? "updated" : "installed");
      changes.push({ action: action, file: event + "/" + modName + ".js" });
      console.log(action);
    }
  }

  // Sync project-scoped modules
  var projects = Object.keys(config.project_modules);
  for (var pi = 0; pi < projects.length; pi++) {
    var projName = projects[pi];
    var projEvents = Object.keys(config.project_modules[projName]);
    for (var pe = 0; pe < projEvents.length; pe++) {
      var pEvent = projEvents[pe];
      var pModules = config.project_modules[projName][pEvent];
      var pTargetDir = path.join(HOOKS_DIR, "run-modules", pEvent, projName);
      if (!dryRun) fs.mkdirSync(pTargetDir, { recursive: true });

      for (var pm = 0; pm < pModules.length; pm++) {
        var pModName = pModules[pm];
        var pRemotePath = "modules/" + pEvent + "/" + pModName + ".js";
        var pLocalPath = path.join(pTargetDir, path.basename(pModName) + ".js");
        var pExisting = fs.existsSync(pLocalPath) ? fs.readFileSync(pLocalPath, "utf-8") : null;

        process.stdout.write("  " + pEvent + "/" + projName + "/" + path.basename(pModName) + ".js ... ");
        var pContent = fetchFromGitHub(config.source, config.branch, pRemotePath);

        if (!pContent) {
          changes.push({ action: "error", file: pEvent + "/" + projName + "/" + path.basename(pModName) + ".js", reason: "not found" });
          console.log("NOT FOUND");
          continue;
        }
        if (pExisting === pContent) {
          changes.push({ action: "up-to-date", file: pEvent + "/" + projName + "/" + path.basename(pModName) + ".js" });
          console.log("up to date");
          continue;
        }
        if (!dryRun) fs.writeFileSync(pLocalPath, pContent);
        var pAction = dryRun ? "would-" + (pExisting ? "update" : "install") : (pExisting ? "updated" : "installed");
        changes.push({ action: pAction, file: pEvent + "/" + projName + "/" + path.basename(pModName) + ".js" });
        console.log(pAction);
      }
    }
  }

  return changes;
}

// ============================================================
// 7. Main Orchestrator
// ============================================================

function openFile(filePath) {
  // Sanitize path to prevent command injection
  if (!/^[a-zA-Z0-9._\-\/\\: ]+$/.test(filePath)) return;
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

// --- Command Handlers ---

function cmdHelp() {
  console.log("hook-runner v" + VERSION + " — modular hook runner for Claude Code");
  console.log("");
  console.log("Usage: node setup.js [command] [options]");
  console.log("");
  console.log("Commands:");
  console.log("  (none)          Full setup wizard (scan → report → backup → install)");
  console.log("  --report        Generate HTML hooks report (works without installing)");
  console.log("  --analyze       Generate report with local analysis (quality score, gaps, DRY, performance)");
  console.log("  --analyze --deep          Also run LLM analysis via claude -p (slower, richer insights)");
  console.log("  --analyze --input <file>  Merge pre-computed LLM analysis JSON into the report");
  console.log("  --health        Verify runners, modules, and settings are correct");
  console.log("  --sync          Sync modules from GitHub per ~/.claude/hooks/modules.yaml");
  console.log("  --list          Show catalog vs installed modules with status");
  console.log("  --stats         Quick text summary of hook log activity");
  console.log("  --lessons       Show self-analysis lessons (--project <name>, --date YYYY-MM-DD)");
  console.log("  --workflow      Manage enforceable step pipelines (list|start|status|complete|reset)");
  console.log("  --export [file] Export installed modules as shareable YAML (default: modules-export.yaml)");
  console.log("  --perf          Analyze module timing data and identify bottlenecks");
  console.log("  --test-module   Test a single module with sample inputs");
  console.log("  --test          Run all test suites (--timeout <sec>, --skip-wsl, --js-only, --sh-only)");
  console.log("  --upgrade       Fetch latest runners from GitHub and update local copies");
  console.log("  --uninstall     Remove hook-runner from settings.json and hooks dir");
  console.log("  --prune [N]     Prune log entries older than N days (default 7)");
  console.log("  --version, -v   Show version");
  console.log("  --integrity     Full integrity scan (file drift + workflow compliance)");
  console.log("  --preflight     Enforcement status: active rules, never-fired gates, pipeline health");
  console.log("  --manifest      Generate ENFORCEMENT.md from live modules + hook log");
  console.log("  --snapshot         Create SHA256 snapshot of current state");
  console.log("  --snapshot drift   Detect drift from last snapshot (--json for machine output)");
  console.log("  --snapshot backup  Copy files to git repo, commit, push");
  console.log("  --snapshot restore Clone repo and copy files back into place");
  console.log("  --audit-project <name>  Audit hook activity for a specific project (blocks, gaps, timeline)");
  console.log("                          Add --json for machine-readable output");
  console.log("  --xref          Show inter-project TODO dashboard (audit log + pending items)");
  console.log("  --demo          Interactive demo — see hook-runner in action (--fast to skip animation)");
  console.log("  --help, -h      Show this help");
  console.log("");
  console.log("Options:");
  console.log("  --dry-run       Preview changes without modifying anything");
  console.log("  --install       Skip report, just install runners");
  console.log("  --open          Open report in browser (default: don't open)");
  console.log("  --force         With --uninstall: also remove non-empty module dirs");
  console.log("  --confirm       With --uninstall: restore original settings.json from backup");
  console.log("  --yes           Non-interactive: auto-confirm install + enable default workflows");
  console.log("");
  console.log("Examples:");
  console.log("  node setup.js                    # first-time setup");
  console.log("  node setup.js --report           # see your hooks without installing");
  console.log("  node setup.js --sync --dry-run   # preview module sync");
  console.log("  node setup.js --uninstall --dry-run  # preview removal");
}

/**
 * Extract changelog sections between two versions.
 * Returns text of all ## [x.y.z] sections where x.y.z is newer than localVer.
 */
function extractChangelogBetween(changelog, localVer, remoteVer) {
  var lines = changelog.split("\n");
  var collecting = false;
  var result = [];
  for (var i = 0; i < lines.length; i++) {
    var heading = lines[i].match(/^## \[([^\]]+)\]/);
    if (heading) {
      var ver = heading[1];
      if (ver === localVer) break; // stop at current version
      collecting = true;
    }
    if (collecting) result.push(lines[i]);
  }
  return result.length > 0 ? result.join("\n").trim() : null;
}

function cmdUpgrade(args, dryRun) {
  console.log("[hook-runner] Upgrade");
  console.log("========================");
  var source = "grobomo/hook-runner";
  var branch = "main";
  var coreFiles = ["setup.js", "report.js"].concat(RUNNER_FILES);
  var remoteSetup = fetchFromGitHub(source, branch, "setup.js");
  if (!remoteSetup) {
    console.log("  ERROR: Could not fetch from GitHub. Check network connection.");
    return;
  }
  var remoteVersionMatch = remoteSetup.match(/var VERSION\s*=\s*"([^"]+)"/);
  var remoteVersion = remoteVersionMatch ? remoteVersionMatch[1] : "unknown";
  console.log("  Local version:  " + VERSION);
  console.log("  Remote version: " + remoteVersion);
  console.log("");
  if (remoteVersion === VERSION && args.indexOf("--force") === -1) {
    console.log("  Already up to date. Use --force to re-download anyway.");
    return;
  }
  // Show what changed between versions
  var changelog = fetchFromGitHub(source, branch, "CHANGELOG.md");
  if (changelog) {
    var sections = extractChangelogBetween(changelog, VERSION, remoteVersion);
    if (sections) {
      console.log("  What's new:");
      console.log("  " + sections.replace(/\n/g, "\n  "));
      console.log("");
    }
  }
  var updated = 0, skipped = 0;
  for (var ui = 0; ui < coreFiles.length; ui++) {
    var fileName = coreFiles[ui];
    var content = fileName === "setup.js" ? remoteSetup : fetchFromGitHub(source, branch, fileName);
    if (!content) {
      console.log("  SKIP: " + fileName + " (not found on remote)");
      skipped++;
      continue;
    }
    var dest = path.join(HOOKS_DIR, fileName);
    if (dryRun) {
      var exists = fs.existsSync(dest);
      console.log("  " + (exists ? "UPDATE" : "CREATE") + ": " + fileName);
    } else {
      fs.writeFileSync(dest, content, "utf-8");
      console.log("  Updated: " + fileName);
    }
    updated++;
  }
  console.log("");
  if (dryRun) {
    console.log("  Dry-run complete. " + updated + " file(s) would be updated.");
  } else {
    console.log("  Upgrade complete: " + updated + " file(s) updated" + (skipped ? ", " + skipped + " skipped" : "") + ".");
    console.log("  Run 'node setup.js --health' to verify.");
  }
}

function cmdUninstall(args, dryRun) {
  console.log("[hook-runner] Uninstall");
  console.log("========================");
  if (dryRun) console.log("  (dry-run mode — no changes will be made)");
  console.log("");
  var uninstallChanges = [];
  var settings = readSettings();
  if (Object.keys(settings).length === 0) {
    uninstallChanges.push({ what: "settings.json", status: "not found or corrupt" });
  } else if (!settings.hooks) {
    uninstallChanges.push({ what: "settings.json", status: "no hooks section found" });
  } else {
    var hookEvents = Object.keys(settings.hooks);
    var runnerPattern = /run-(pretooluse|posttooluse|stop|sessionstart|userpromptsubmit)\.js/;
    var keptEvents = {};
    for (var ui = 0; ui < hookEvents.length; ui++) {
      var evt = hookEvents[ui];
      var entries = settings.hooks[evt];
      if (!Array.isArray(entries)) { keptEvents[evt] = entries; continue; }
      var kept = entries.filter(function(entry) {
        var hooks = entry.hooks || [];
        return !hooks.some(function(h) { return h.command && runnerPattern.test(h.command); });
      });
      if (kept.length > 0) {
        keptEvents[evt] = kept;
        uninstallChanges.push({ what: "settings.json " + evt, status: "kept " + kept.length + " non-runner entry(s)" });
      } else {
        uninstallChanges.push({ what: "settings.json " + evt, status: "removed" });
      }
    }
    settings.hooks = keptEvents;
    if (Object.keys(keptEvents).length === 0) delete settings.hooks;
    if (!dryRun) {
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
    }
  }
  var runnerFiles = RUNNER_FILES.concat(["setup.js", "report.js"]);
  for (var uf = 0; uf < runnerFiles.length; uf++) {
    var fp = path.join(HOOKS_DIR, runnerFiles[uf]);
    if (fs.existsSync(fp)) {
      if (!dryRun) fs.unlinkSync(fp);
      uninstallChanges.push({ what: runnerFiles[uf], status: dryRun ? "would remove" : "removed" });
    }
  }
  var forceMode = args.indexOf("--force") !== -1;
  var runModulesDir = path.join(HOOKS_DIR, "run-modules");
  if (fs.existsSync(runModulesDir)) {
    var eventDirs = ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];
    for (var ud = 0; ud < eventDirs.length; ud++) {
      var evDir = path.join(runModulesDir, eventDirs[ud]);
      if (!fs.existsSync(evDir)) continue;
      var contents = fs.readdirSync(evDir);
      if (contents.length === 0 || forceMode) {
        if (!dryRun) fs.rmSync(evDir, { recursive: true });
        uninstallChanges.push({ what: "run-modules/" + eventDirs[ud], status: (dryRun ? "would remove" : "removed") + (contents.length > 0 ? " (" + contents.length + " files)" : "") });
      } else {
        uninstallChanges.push({ what: "run-modules/" + eventDirs[ud], status: "kept (has " + contents.length + " module(s) — use --force to remove)" });
      }
    }
    try {
      var remaining = fs.readdirSync(runModulesDir);
      if (remaining.length === 0) {
        if (!dryRun) fs.rmdirSync(runModulesDir);
        uninstallChanges.push({ what: "run-modules/", status: dryRun ? "would remove" : "removed" });
      }
    } catch(e) {}
  }
  var logFile = path.join(HOOKS_DIR, "hook-log.jsonl");
  var logFile1 = logFile + ".1";
  for (var lf = 0; lf < 2; lf++) {
    var lfp = lf === 0 ? logFile : logFile1;
    if (fs.existsSync(lfp)) {
      if (!dryRun) fs.unlinkSync(lfp);
      uninstallChanges.push({ what: path.basename(lfp), status: dryRun ? "would remove" : "removed" });
    }
  }
  // WHY: Restoring the original settings.json from backup gives a true "undo".
  // Without this, uninstall leaves a modified settings.json that may confuse users.
  var confirmMode = args.indexOf("--confirm") !== -1;
  var archiveDir = path.join(HOOKS_DIR, "archive");
  if (confirmMode && fs.existsSync(archiveDir)) {
    // Find most recent backup with settings.json
    var backups = fs.readdirSync(archiveDir).filter(function(d) {
      return d.indexOf("backup-") === 0 && fs.existsSync(path.join(archiveDir, d, "settings.json"));
    }).sort().reverse();
    if (backups.length > 0) {
      var latestBackup = path.join(archiveDir, backups[0], "settings.json");
      if (!dryRun) {
        fs.copyFileSync(latestBackup, SETTINGS_PATH);
      }
      uninstallChanges.push({ what: "settings.json", status: (dryRun ? "would restore from " : "restored from ") + backups[0] });
    }
  }

  for (var uc = 0; uc < uninstallChanges.length; uc++) {
    console.log("  " + uninstallChanges[uc].what + ": " + uninstallChanges[uc].status);
  }
  console.log("");
  if (!confirmMode && !dryRun) {
    console.log("  Tip: use --uninstall --confirm to also restore original settings.json from backup.");
  }
  console.log("[hook-runner] " + (dryRun ? "Dry-run complete. No changes made." : "Uninstall complete."));
}

function cmdPrune(args, dryRun) {
  var pruneIdx = args.indexOf("--prune");
  var pruneDays = parseInt(args[pruneIdx + 1], 10) || 7;
  console.log("[hook-runner] Log Prune");
  console.log("========================");
  console.log("  Keeping entries from last " + pruneDays + " day(s)");
  if (dryRun) console.log("  (dry-run mode)");
  var pruneResult = pruneLog(pruneDays, dryRun);
  console.log("  Kept: " + pruneResult.kept + " entries");
  console.log("  Pruned: " + pruneResult.pruned + " entries");
  if (pruneResult.rotatedRemoved) console.log("  Rotated log (.1): " + (dryRun ? "would remove" : "removed"));
  console.log("");
  console.log("[hook-runner] " + (dryRun ? "Dry-run complete." : "Prune complete."));
}

function cmdStats() {
  console.log("[hook-runner] Log Stats");
  console.log("========================");
  var hs = readHookStats(3);
  var hsKeys = Object.keys(hs).sort();
  if (hsKeys.length === 0) {
    console.log("  No hook log data found.");
    return;
  }
  var totalInv = 0, totalBlk = 0, totalErr = 0;
  for (var si = 0; si < hsKeys.length; si++) {
    totalInv += hs[hsKeys[si]].total;
    totalBlk += hs[hsKeys[si]].block;
    totalErr += hs[hsKeys[si]].error;
  }
  console.log("  Total invocations: " + totalInv);
  console.log("  Total blocks: " + totalBlk + " (" + (totalInv > 0 ? ((totalBlk / totalInv) * 100).toFixed(1) : "0") + "%)");
  if (totalErr > 0) console.log("  Total errors: " + totalErr);
  console.log("");
  var hasActivity = false;
  for (var sj = 0; sj < hsKeys.length; sj++) {
    var st = hs[hsKeys[sj]];
    if (st.block > 0 || st.error > 0) {
      if (!hasActivity) { console.log("  Active hooks:"); hasActivity = true; }
      var parts = "    " + hsKeys[sj];
      if (st.block > 0) parts += "  " + st.block + " blocked";
      if (st.error > 0) parts += "  " + st.error + " errors";
      console.log(parts);
    }
  }
  if (!hasActivity) console.log("  No blocks or errors recorded.");
  console.log("");

  // Timing summary — show modules with timing data, sorted by avg latency
  var timed = [];
  for (var sk = 0; sk < hsKeys.length; sk++) {
    var tm = hs[hsKeys[sk]];
    if (tm.msCount > 0) {
      timed.push({ key: hsKeys[sk], avg: Math.round(tm.msTotal / tm.msCount), max: tm.msMax, count: tm.msCount });
    }
  }
  if (timed.length > 0) {
    timed.sort(function(a, b) { return b.avg - a.avg; });
    console.log("  Module timing (avg / max ms):");
    for (var sl = 0; sl < timed.length && sl < 15; sl++) {
      console.log("    " + timed[sl].key + "  avg:" + timed[sl].avg + "ms  max:" + timed[sl].max + "ms  (" + timed[sl].count + " samples)");
    }
    console.log("");
  }
}

function cmdLessons(args) {
  console.log("[hook-runner] Self-Analysis Lessons");
  console.log("========================");
  var lessonsFile = path.join(HOOKS_DIR, "self-analysis-lessons.jsonl");
  var archiveFile = path.join(HOOKS_DIR, "self-analysis-lessons-archive.jsonl");

  // Parse filters
  var filterProject = null;
  var filterDate = null;
  var pidx = args.indexOf("--project");
  if (pidx !== -1 && args[pidx + 1]) filterProject = args[pidx + 1].toLowerCase();
  var didx = args.indexOf("--date");
  if (didx !== -1 && args[didx + 1]) filterDate = args[didx + 1];
  var showArchive = args.indexOf("--archive") !== -1;

  var targetFile = showArchive ? archiveFile : lessonsFile;
  if (!fs.existsSync(targetFile)) {
    console.log("  No lessons file found at " + targetFile);
    return;
  }
  var content = fs.readFileSync(targetFile, "utf-8").trim();
  if (!content) {
    console.log("  Lessons file is empty.");
    return;
  }
  var lines = content.split("\n").filter(function(l) { return l.trim(); });
  var lessons = [];
  for (var i = 0; i < lines.length; i++) {
    try {
      var obj = JSON.parse(lines[i]);
      if (filterProject && obj.lesson && obj.lesson.toLowerCase().indexOf(filterProject) === -1 &&
          (!obj.session || obj.session.toLowerCase().indexOf(filterProject) === -1)) continue;
      if (filterDate && obj.ts && obj.ts.indexOf(filterDate) !== 0) continue;
      lessons.push(obj);
    } catch(e) {}
  }
  console.log("  Total: " + lessons.length + " lesson(s)" + (showArchive ? " (archive)" : ""));
  if (filterProject) console.log("  Filter: project contains '" + filterProject + "'");
  if (filterDate) console.log("  Filter: date starts with '" + filterDate + "'");
  console.log("");
  for (var j = 0; j < lessons.length; j++) {
    var l = lessons[j];
    var prefix = l.ts ? "[" + l.ts.slice(0, 10) + "] " : "";
    console.log("  " + prefix + (l.lesson || "(no lesson text)"));
  }
  if (lessons.length === 0) console.log("  No lessons match the given filters.");
}

function cmdList() {
  console.log("[hook-runner] Module List");
  console.log("========================");
  var catalogDir = path.join(REPO_DIR, "modules");
  var events = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop", "SessionStart"];
  var catalog = {};
  var catalogCount = 0;
  for (var li = 0; li < events.length; li++) {
    var evDir = path.join(catalogDir, events[li]);
    catalog[events[li]] = [];
    try {
      var files = fs.readdirSync(evDir).filter(function(f) { return f.slice(-3) === ".js"; }).sort();
      catalog[events[li]] = files;
      catalogCount += files.length;
    } catch(e) {}
  }
  var liveDir = path.join(HOOKS_DIR, "run-modules");
  var installed = {};
  var installedCount = 0;
  for (var lj = 0; lj < events.length; lj++) {
    var livEvDir = path.join(liveDir, events[lj]);
    installed[events[lj]] = [];
    try {
      var livFiles = fs.readdirSync(livEvDir).filter(function(f) { return f.slice(-3) === ".js"; }).sort();
      installed[events[lj]] = livFiles;
      installedCount += livFiles.length;
    } catch(e) {}
  }
  for (var lk = 0; lk < events.length; lk++) {
    var ev = events[lk];
    var catMods = catalog[ev];
    var instMods = installed[ev];
    if (catMods.length === 0 && instMods.length === 0) continue;
    console.log("");
    console.log("  " + ev + ":");
    var allMods = {};
    for (var cm = 0; cm < catMods.length; cm++) allMods[catMods[cm]] = { catalog: true, installed: false };
    for (var im = 0; im < instMods.length; im++) {
      if (!allMods[instMods[im]]) allMods[instMods[im]] = { catalog: false, installed: false };
      allMods[instMods[im]].installed = true;
    }
    var modNames = Object.keys(allMods).sort();
    for (var mn = 0; mn < modNames.length; mn++) {
      var m = allMods[modNames[mn]];
      var status = m.installed && m.catalog ? " [installed]" :
                   m.installed && !m.catalog ? " [installed, custom]" :
                   " [available]";
      console.log("    " + modNames[mn].replace(".js", "") + status);
    }
  }
  var projScoped = [];
  for (var pe = 0; pe < events.length; pe++) {
    try {
      var liveEvtDir = path.join(liveDir, events[pe]);
      var liveEntries = fs.readdirSync(liveEvtDir, { withFileTypes: true });
      var projDirs = liveEntries.filter(function(e) { return e.isDirectory() && e.name !== "archive"; });
      for (var pd = 0; pd < projDirs.length; pd++) {
        var projPath = path.join(liveEvtDir, projDirs[pd].name);
        var projMods = fs.readdirSync(projPath).filter(function(f) { return f.slice(-3) === ".js"; });
        for (var pm = 0; pm < projMods.length; pm++) {
          projScoped.push(events[pe] + "/" + projDirs[pd].name + "/" + projMods[pm].replace(".js", ""));
        }
      }
    } catch(e) {}
  }
  if (projScoped.length > 0) {
    console.log("");
    console.log("  Project-scoped:");
    for (var ps = 0; ps < projScoped.length; ps++) {
      console.log("    " + projScoped[ps] + " [installed]");
    }
  }
  console.log("");
  console.log("[hook-runner] " + installedCount + " installed, " + catalogCount + " in catalog");
}

function cmdTest(args) {
  // Parse test-specific flags
  var timeoutIdx = args ? args.indexOf("--timeout") : -1;
  var customTimeout = timeoutIdx !== -1 && args[timeoutIdx + 1] ? parseInt(args[timeoutIdx + 1], 10) * 1000 : 0;
  var skipWsl = args && args.indexOf("--skip-wsl") !== -1;
  var jsOnly = args && args.indexOf("--js-only") !== -1;
  var shOnly = args && args.indexOf("--sh-only") !== -1;
  var JS_TIMEOUT = customTimeout || 60000;   // 60s default for JS (some create git repos)
  var SH_TIMEOUT = customTimeout || 60000;   // 60s default for bash
  // Tests that call WSL — detected by grep at startup or known list
  var WSL_TESTS = ["test-openclaw-e2e.sh"];

  console.log("[hook-runner] Test Suite");
  console.log("========================");
  if (skipWsl) console.log("  (skipping WSL-dependent tests)");
  if (jsOnly) console.log("  (JS tests only)");
  if (shOnly) console.log("  (bash tests only)");
  console.log("  Timeouts: JS=" + (JS_TIMEOUT / 1000) + "s, bash=" + (SH_TIMEOUT / 1000) + "s");
  var testDir = path.join(REPO_DIR, "scripts", "test");
  var testFiles;
  try {
    testFiles = fs.readdirSync(testDir).filter(function(f) {
      if (f.indexOf("test-") !== 0) return false;
      var isSh = f.slice(-3) === ".sh";
      var isJs = f.slice(-3) === ".js";
      if (!isSh && !isJs) return false;
      if (jsOnly && !isJs) return false;
      if (shOnly && !isSh) return false;
      if (skipWsl && WSL_TESTS.indexOf(f) !== -1) return false;
      return true;
    }).sort();
  } catch(e) {
    console.log("  ERROR: test directory not found: " + testDir);
    process.exit(1);
  }
  if (testFiles.length === 0) {
    console.log("  No test scripts found in " + testDir);
    process.exit(1);
  }
  // Also detect WSL tests dynamically: scan first line for wsl/openclaw
  if (skipWsl) {
    testFiles = testFiles.filter(function(f) {
      if (f.slice(-3) !== ".sh") return true;
      try {
        var head = fs.readFileSync(path.join(testDir, f), "utf-8").slice(0, 2000);
        return !/\bwsl\b/i.test(head) && !/\bopenclaw\b/i.test(head);
      } catch(e) { return true; }
    });
  }
  // Pre-test cleanup: remove any leftover test-tmp-mod-* artifacts from previous runs
  var preCleanDirs = [path.join(REPO_DIR, "modules", "PreToolUse"), path.join(REPO_DIR, "modules", "PostToolUse")];
  for (var pci = 0; pci < preCleanDirs.length; pci++) {
    try {
      var pcFiles = fs.readdirSync(preCleanDirs[pci]);
      for (var pcf = 0; pcf < pcFiles.length; pcf++) {
        if (pcFiles[pcf].indexOf("test-tmp-mod-") === 0) {
          fs.unlinkSync(path.join(preCleanDirs[pci], pcFiles[pcf]));
        }
      }
    } catch(e) {}
  }
  // Restore workflow YAML in case previous test left it dirty
  try { cp.execSync("git checkout -- workflows/no-local-docker.yml", { cwd: REPO_DIR, stdio: "pipe" }); } catch(e) {}

  var totalPass = 0, totalFail = 0, suiteFail = 0, suiteTimeout = 0;
  var failedSuites = [], timedOutSuites = [], skippedCount = 0;
  var startTime = Date.now();
  for (var ti = 0; ti < testFiles.length; ti++) {
    var testPath = path.join(testDir, testFiles[ti]);
    var isJs = testFiles[ti].slice(-3) === ".js";
    var suiteName = testFiles[ti].replace("test-", "").replace(/\.(sh|js)$/, "");
    var suiteStart = Date.now();
    // Per-file timeout: read "// TIMEOUT: N" or "# TIMEOUT: N" from first 5 lines
    var testTimeout = isJs ? JS_TIMEOUT : SH_TIMEOUT;
    try {
      var head = fs.readFileSync(testPath, "utf-8").slice(0, 500);
      var tmMatch = head.match(/(?:\/\/|#)\s*TIMEOUT:\s*(\d+)/);
      if (tmMatch) testTimeout = parseInt(tmMatch[1], 10) * 1000;
    } catch(e2) {}
    console.log("");
    console.log("  [" + suiteName + "] " + testFiles[ti] + " (timeout: " + (testTimeout / 1000) + "s)");
    try {
      var execCmd = isJs ? "node " + JSON.stringify(testPath) : "bash " + JSON.stringify(testPath);
      var result = cp.execSync(execCmd, {
        cwd: REPO_DIR,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: testTimeout
      });
      var elapsed = ((Date.now() - suiteStart) / 1000).toFixed(1);
      var match = result.match(/(\d+) passed, (\d+) failed/);
      if (match) {
        totalPass += parseInt(match[1], 10);
        totalFail += parseInt(match[2], 10);
        if (parseInt(match[2], 10) > 0) { suiteFail++; failedSuites.push(suiteName); }
      }
      var lines = result.trim().split("\n");
      var summaryLines = lines.slice(-3);
      for (var sl = 0; sl < summaryLines.length; sl++) {
        console.log("    " + summaryLines[sl]);
      }
      console.log("    (" + elapsed + "s)");
    } catch(e) {
      var elapsed2 = ((Date.now() - suiteStart) / 1000).toFixed(1);
      var isTimeout = e.killed || e.signal === "SIGTERM" || (Date.now() - suiteStart) >= testTimeout - 500;
      if (isTimeout) {
        // Timeout — distinct from failure
        suiteTimeout++;
        timedOutSuites.push(suiteName);
        console.log("    TIMEOUT: killed after " + (testTimeout / 1000) + "s (" + elapsed2 + "s elapsed)");
        // Still count any partial results
        var timeoutOut = (e.stdout || "") + (e.stderr || "");
        var timeoutMatch = timeoutOut.match(/(\d+) passed, (\d+) failed/);
        if (timeoutMatch) {
          totalPass += parseInt(timeoutMatch[1], 10);
          totalFail += parseInt(timeoutMatch[2], 10);
        }
      } else {
        suiteFail++;
        failedSuites.push(suiteName);
        console.log("    FAIL: suite crashed (exit code " + (e.status || "unknown") + ") (" + elapsed2 + "s)");
        var errOut = (e.stdout || "") + (e.stderr || "");
        var errLines = errOut.trim().split("\n").slice(-5);
        for (var el = 0; el < errLines.length; el++) {
          console.log("    " + errLines[el]);
        }
        var partMatch = errOut.match(/(\d+) passed, (\d+) failed/);
        if (partMatch) {
          totalPass += parseInt(partMatch[1], 10);
          totalFail += parseInt(partMatch[2], 10);
        }
      }
    }
  }
  var totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("");
  console.log("========================");
  console.log("[hook-runner] " + testFiles.length + " suites, " + totalPass + " passed, " + totalFail + " failed" +
    (suiteTimeout > 0 ? ", " + suiteTimeout + " timed out" : "") +
    " (" + totalElapsed + "s)");
  if (suiteFail > 0) {
    console.log("[hook-runner] " + suiteFail + " suite(s) had failures: " + failedSuites.join(", "));
  }
  if (suiteTimeout > 0) {
    console.log("[hook-runner] " + suiteTimeout + " suite(s) timed out: " + timedOutSuites.join(", "));
  }
  if (suiteFail > 0) process.exit(1);
}

function cmdHealth() {
  console.log("[hook-runner] Health Check");
  console.log("========================");
  var results = healthCheck();
  var ok = 0, warn = 0, fail = 0;
  for (var hi = 0; hi < results.length; hi++) {
    var r = results[hi];
    var icon = r.status === "ok" ? "  OK" : r.status === "warning" ? "WARN" : "FAIL";
    if (r.status === "ok") ok++;
    else if (r.status === "warning") warn++;
    else fail++;
    var line = "  [" + icon + "] " + r.check + ": " + r.file;
    if (r.detail) line += " — " + r.detail;
    console.log(line);
  }
  console.log("");
  console.log("[hook-runner] " + ok + " ok, " + warn + " warnings, " + fail + " failures");
  if (fail > 0) process.exit(1);
}

function cmdSync(dryRun) {
  console.log("[hook-runner] Module Sync");
  console.log("========================");
  console.log("  Config: " + MODULES_YAML_PATH);
  if (dryRun) console.log("  (dry-run mode)");
  console.log("");
  var syncChanges = syncModules(dryRun);
  var installed = syncChanges.filter(function(c) { return c.action === "installed" || c.action === "updated"; }).length;
  var upToDate = syncChanges.filter(function(c) { return c.action === "up-to-date"; }).length;
  var wouldChange = syncChanges.filter(function(c) { return /^would-/.test(c.action); }).length;
  var errors = syncChanges.filter(function(c) { return c.action === "error"; }).length;
  console.log("");
  if (dryRun) {
    console.log("[hook-runner] Dry-run: " + wouldChange + " would change, " + upToDate + " up to date" + (errors ? ", " + errors + " errors" : ""));
  } else {
    console.log("[hook-runner] Sync complete: " + installed + " installed/updated, " + upToDate + " up to date" + (errors ? ", " + errors + " errors" : ""));
  }
}

function cmdWizard(reportOnly, dryRun, openMode, autoYes, analyzeMode, deepMode, inputFile) {
  console.log("[hook-runner] Setup Wizard");
  console.log("========================");

  // Step 1: Scan
  console.log("[1/5] Scanning current hooks...");
  var scan = scanHooks();
  var eventNames = Object.keys(scan.events);
  console.log("  Found " + scan.totalHooks + " hook(s) across " + eventNames.length + " event(s)");

  // Read hook stats for report
  var hookStats = readHookStats(5);
  var statsEntries = Object.keys(hookStats);
  if (statsEntries.length > 0) {
    var totalInvocations = 0;
    for (var si2 = 0; si2 < statsEntries.length; si2++) totalInvocations += hookStats[statsEntries[si2]].total;
    console.log("  Hook log: " + totalInvocations + " invocations across " + statsEntries.length + " modules");
  }

  // Step 2: Generate "before" report
  console.log("[2/5] Generating hooks report...");
  var beforeReport = path.join(REPORT_DIR, "hooks-report-before.html");
  generateReport(scan, beforeReport, hookStats, { analyze: analyzeMode, deep: deepMode, inputFile: inputFile });
  console.log("  Report: " + beforeReport);
  if (openMode) openFile(beforeReport);

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
    if (autoYes) {
      console.log("  [--yes] Would enable default workflows: starter");
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
  generateReport(afterScan, afterReport, hookStats);
  console.log("  Report: " + afterReport);
  if (openMode) openFile(afterReport);

  // Step 7: Enable default workflows (if --yes or interactive)
  // WHY: New users don't know which workflows to enable. "starter" provides
  // safe defaults (force-push, secret-scan, archive-not-delete) without
  // overwhelming them with 90 shtd modules. Users enable shtd manually later.
  var enableWorkflows = autoYes;
  if (enableWorkflows) {
    console.log("[6/6] Enabling default workflows...");
    var wf = require("./workflow");
    var globalDir = path.join(os.homedir(), ".claude", "hooks");
    var defaultWorkflows = ["starter"];
    for (var wi = 0; wi < defaultWorkflows.length; wi++) {
      var wfName = defaultWorkflows[wi];
      try {
        var workflows = wf.findWorkflows(process.cwd());
        var found = false;
        for (var wj = 0; wj < workflows.length; wj++) {
          if (workflows[wj].name === wfName) { found = true; break; }
        }
        if (found) {
          wf.enableWorkflow(wfName, globalDir);
          console.log("  Enabled workflow: " + wfName);
        } else {
          console.log("  Workflow not found (skip): " + wfName);
        }
      } catch (e) {
        console.log("  Could not enable " + wfName + ": " + (e.message || "").slice(0, 80));
      }
    }
  }

  // Summary
  console.log("");
  console.log("============================================");
  console.log("[hook-runner] Installation Complete");
  console.log("============================================");
  console.log("  Runners installed: ~/.claude/hooks/run-*.js");
  console.log("  Module dirs: ~/.claude/hooks/run-modules/{Event}/");
  console.log("  Backup: " + backup.backupDir);
  console.log("  Report: " + afterReport);
  if (enableWorkflows) {
    console.log("  Default workflows enabled: shtd");
  }
  console.log("");
  console.log("  To add a hook module:");
  console.log("    Create ~/.claude/hooks/run-modules/<Event>/my-module.js");
  console.log("    Export: module.exports = function(input) { return null; }");
  console.log("");
  console.log("  To manage workflows:");
  console.log("    node setup.js --workflow list      # see available workflows");
  console.log("    node setup.js --workflow enable X   # enable a workflow");
  console.log("");
  console.log("  To restore original hooks:");
  console.log("    node setup.js --uninstall --confirm");
  console.log("============================================");
}

function cmdPerf() {
  console.log("[hook-runner] Performance Analysis");
  console.log("========================");
  var hs = readHookStats(0);
  var hsKeys = Object.keys(hs).sort();

  // Build set of currently installed modules for cross-reference
  var installedModules = {};
  var modsDir = path.join(HOOKS_DIR, "run-modules");
  if (fs.existsSync(modsDir)) {
    var modEvents = ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];
    for (var me = 0; me < modEvents.length; me++) {
      var evDir = path.join(modsDir, modEvents[me]);
      if (fs.existsSync(evDir)) {
        try {
          var entries = fs.readdirSync(evDir, { withFileTypes: true });
          for (var ei = 0; ei < entries.length; ei++) {
            if (entries[ei].isFile() && entries[ei].name.slice(-3) === ".js") {
              installedModules[modEvents[me] + "/" + entries[ei].name.replace(".js", "")] = true;
            }
          }
        } catch(e) {}
      }
    }
  }

  // Group by event (only count installed modules toward overhead estimate)
  var events = {};
  var timed = [];
  for (var i = 0; i < hsKeys.length; i++) {
    var key = hsKeys[i];
    var st = hs[key];
    var parts = key.split("/");
    var evt = parts[0];
    if (!events[evt]) events[evt] = { modules: [], totalAvg: 0, count: 0 };
    if (st.msCount > 0) {
      var avg = Math.round(st.msTotal / st.msCount);
      var entry = { key: key, name: parts.slice(1).join("/"), avg: avg, max: st.msMax, count: st.msCount, total: st.total };
      events[evt].modules.push(entry);
      if (installedModules[key]) {
        events[evt].totalAvg += avg;
        events[evt].count++;
      }
      timed.push(entry);
    }
  }

  if (timed.length === 0) {
    console.log("  No timing data yet. Timing is recorded after v1.4.0 runners are installed.");
    console.log("  Run some tool calls, then check again.");
    return;
  }

  // Per-event overhead (only installed modules)
  var evtNames = Object.keys(events).sort();
  console.log("\n  Estimated overhead per event (sum of avg module times):");
  for (var j = 0; j < evtNames.length; j++) {
    var ev = events[evtNames[j]];
    if (ev.count === 0) continue;
    console.log("    " + evtNames[j] + ": ~" + ev.totalAvg + "ms (" + ev.count + " modules)");
  }

  // Slow modules (>5ms avg)
  timed.sort(function(a, b) { return b.avg - a.avg; });
  var slow = timed.filter(function(t) { return t.avg > 5; });
  if (slow.length > 0) {
    console.log("\n  Slow modules (>5ms avg):");
    for (var k = 0; k < slow.length; k++) {
      var s = slow[k];
      var note = "";
      if (s.max > 100) note = "  *** spikes to " + s.max + "ms";
      var removed = !installedModules[s.key] ? " [removed]" : "";
      console.log("    " + s.key + "  avg:" + s.avg + "ms  max:" + s.max + "ms  (" + s.count + " calls)" + note + removed);
    }
  } else {
    console.log("\n  All modules under 5ms avg — no bottlenecks detected.");
  }

  // Total tool call overhead estimate (PreToolUse is on every tool call)
  if (events.PreToolUse && events.PreToolUse.totalAvg > 0) {
    console.log("\n  PreToolUse total overhead: ~" + events.PreToolUse.totalAvg + "ms per tool call");
    if (events.PreToolUse.totalAvg > 50) {
      console.log("  WARNING: >50ms overhead. Consider disabling unused modules.");
    } else if (events.PreToolUse.totalAvg > 20) {
      console.log("  NOTE: 20-50ms range. Acceptable but monitor for growth.");
    } else {
      console.log("  OK: <20ms. Minimal impact on tool call latency.");
    }
  }
  console.log("");
}

// T494: Per-project hook audit — fired modules, blocks, coverage gaps, timing
function cmdAuditProject(args) {
  var projIdx = args.indexOf("--audit-project");
  var projName = projIdx >= 0 && args[projIdx + 1] ? args[projIdx + 1] : "";
  if (!projName || projName.indexOf("--") === 0) {
    console.log("Usage: node setup.js --audit-project <name>");
    console.log("  Filters hook log by project name (fuzzy match).");
    console.log("  Shows: blocks, passes, coverage gaps, timeline.");
    console.log("  Example: node setup.js --audit-project dd-lab");
    return;
  }

  console.log("[hook-runner] Project Audit: " + projName);
  console.log("========================");

  // Read all log entries matching project name
  var entries = [];
  function readLogFile(logFile) {
    if (!fs.existsSync(logFile)) return;
    try {
      var lines = fs.readFileSync(logFile, "utf-8").split("\n");
      for (var i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        try {
          var obj = JSON.parse(lines[i]);
          var proj = String(obj.project || "");
          if (proj.toLowerCase().indexOf(projName.toLowerCase()) !== -1) entries.push(obj);
        } catch (e) {}
      }
    } catch (e) {}
  }
  readLogFile(HOOK_LOG_PATH + ".1");
  readLogFile(HOOK_LOG_PATH);

  if (entries.length === 0) {
    console.log("  No log entries found for '" + projName + "'.");
    console.log("  Run a session in that project to generate hook activity.");
    return;
  }

  // Aggregate
  var byModule = {}, byEvent = {}, blocks = [], firstTs = "", lastTs = "";
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var key = e.event + "/" + e.module;
    if (!byModule[key]) byModule[key] = { pass: 0, block: 0, error: 0, total: 0, msTotal: 0, msCount: 0, msMax: 0 };
    byModule[key].total++;
    var r = e.result || "pass";
    if (r === "pass" || r === "text") byModule[key].pass++;
    else if (r === "block" || r === "deny") byModule[key].block++;
    else if (r === "error") byModule[key].error++;
    byEvent[e.event] = (byEvent[e.event] || 0) + 1;
    var ts = e.ts || "";
    if (ts && (!firstTs || ts < firstTs)) firstTs = ts;
    if (ts && ts > lastTs) lastTs = ts;
    if (typeof e.ms === "number") { byModule[key].msTotal += e.ms; byModule[key].msCount++; if (e.ms > byModule[key].msMax) byModule[key].msMax = e.ms; }
    if (r === "block" || r === "deny") {
      blocks.push({ ts: e.ts || "", module: e.module || "", event: e.event || "", tool: e.tool || "", reason: String(e.reason || "").substring(0, 120) });
    }
  }

  // Summary
  var totalPass = 0, totalBlock = 0;
  var modKeys = Object.keys(byModule).sort();
  modKeys.forEach(function(k) { totalPass += byModule[k].pass; totalBlock += byModule[k].block; });

  console.log("  Entries: " + entries.length + " (" + (firstTs ? firstTs.substring(0, 10) : "?") + " to " + (lastTs ? lastTs.substring(0, 10) : "?") + ")");
  console.log("  Pass: " + totalPass + "  Block: " + totalBlock);
  console.log("");

  // By event
  console.log("  By event:");
  Object.keys(byEvent).sort().forEach(function(ev) { console.log("    " + ev + ": " + byEvent[ev]); });
  console.log("");

  // Blocks detail
  if (blocks.length > 0) {
    console.log("  Blocks (" + blocks.length + "):");
    blocks.forEach(function(b) {
      console.log("    [" + (b.ts ? b.ts.substring(0, 19) : "?") + "] " + b.module + " (" + b.tool + ")");
      if (b.reason) console.log("      " + b.reason);
    });
    console.log("");
  }

  // Coverage gaps — installed modules that never fired for this project
  var firedSet = {};
  modKeys.forEach(function(k) { firedSet[k] = true; });
  var gaps = [];
  var modEvents = ["PreToolUse", "PostToolUse", "SessionStart", "Stop"];
  modEvents.forEach(function(evt) {
    var modDir = path.join(HOOKS_DIR, "run-modules", evt);
    if (!fs.existsSync(modDir)) return;
    try {
      fs.readdirSync(modDir).forEach(function(f) {
        if (!f.endsWith(".js") || f.startsWith("_")) return;
        var modName = evt + "/" + f.replace(".js", "");
        if (!firedSet[modName]) gaps.push(modName);
      });
    } catch (e) {}
  });

  var installedCount = modEvents.reduce(function(sum, evt) {
    var d = path.join(HOOKS_DIR, "run-modules", evt);
    try { return sum + fs.readdirSync(d).filter(function(f) { return f.endsWith(".js") && !f.startsWith("_"); }).length; } catch(e) { return sum; }
  }, 0);

  console.log("  Module coverage:");
  console.log("    Installed: " + installedCount + "  Fired: " + modKeys.length + "  Gaps: " + gaps.length);
  if (gaps.length > 0 && gaps.length <= 40) {
    var gByEvt = {};
    gaps.forEach(function(g) { var ev = g.split("/")[0]; if (!gByEvt[ev]) gByEvt[ev] = []; gByEvt[ev].push(g.split("/").slice(1).join("/")); });
    Object.keys(gByEvt).sort().forEach(function(ev) { console.log("    [" + ev + "] " + gByEvt[ev].join(", ")); });
  }
  console.log("");

  // Timing top 10
  var timed = modKeys.filter(function(k) { return byModule[k].msCount > 0; })
    .map(function(k) { var m = byModule[k]; return { key: k, avg: Math.round(m.msTotal / m.msCount), max: m.msMax, count: m.msCount }; })
    .sort(function(a, b) { return b.avg - a.avg; }).slice(0, 10);
  if (timed.length > 0) {
    console.log("  Timing (top 10 slowest):");
    timed.forEach(function(t) {
      var note = t.max > 100 ? "  *** spike " + t.max + "ms" : "";
      console.log("    " + t.key + "  avg:" + t.avg + "ms  (" + t.count + " calls)" + note);
    });
    console.log("");
  }

  // Verdict
  var blockRate = entries.length > 0 ? Math.round(totalBlock / entries.length * 100) : 0;
  console.log("  Verdict:");
  console.log("    Block rate: " + blockRate + "% (" + totalBlock + "/" + entries.length + ")");
  if (gaps.length > installedCount * 0.5) console.log("    WARNING: >50% modules never fired — session may be too short for coverage");
  if (blockRate > 20) console.log("    NOTE: High block rate — check workflow config for this project");
  else if (totalBlock === 0) console.log("    OK: No blocks — hooks are passing cleanly");
  console.log("");
}

// T494: Per-project hook audit — shows what fired, what blocked, gaps, timing
// T500: Added --json output mode for programmatic consumption
function cmdAuditProject(args) {
  var idx = args.indexOf("--audit-project");
  var projectName = (idx !== -1 && args[idx + 1]) ? args[idx + 1] : "";
  if (!projectName || projectName.indexOf("--") === 0) {
    console.log("Usage: node setup.js --audit-project <project-name> [--json]");
    console.log("  Audits hook activity for a specific project from hook-log.jsonl.");
    console.log("  Example: node setup.js --audit-project dd-lab");
    console.log("  Example: node setup.js --audit-project dd-lab --json");
    return;
  }
  var jsonMode = args.indexOf("--json") !== -1;

  // Read all log entries for this project (fuzzy match on path)
  var entries = [];
  [HOOK_LOG_PATH + ".1", HOOK_LOG_PATH].forEach(function(logFile) {
    if (!fs.existsSync(logFile)) return;
    try {
      var lines = fs.readFileSync(logFile, "utf-8").split("\n");
      for (var i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        try {
          var e = JSON.parse(lines[i]);
          var proj = (e.project || "").split("\\").join("/");
          if (proj.toLowerCase().indexOf(projectName.toLowerCase()) !== -1) entries.push(e);
        } catch(err) {}
      }
    } catch(err) {}
  });

  if (entries.length === 0) {
    if (jsonMode) { console.log(JSON.stringify({ project: projectName, error: "no_data", entries: 0 })); }
    else {
      console.log("[hook-runner] Project Audit: " + projectName);
      console.log("========================\n");
      console.log("  No log entries found for project '" + projectName + "'.");
      console.log("  Run a Claude Code session in that project to generate hook data.");
    }
    return;
  }

  // Time range
  var firstTs = entries[0].ts || "";
  var lastTs = entries[entries.length - 1].ts || "";

  // By event
  var byEvent = {};
  entries.forEach(function(e) {
    var evt = e.event || "unknown";
    if (!byEvent[evt]) byEvent[evt] = { total: 0, pass: 0, block: 0 };
    byEvent[evt].total++;
    if (e.result === "block" || e.result === "deny") byEvent[evt].block++;
    else byEvent[evt].pass++;
  });

  // By module
  var byModule = {};
  entries.forEach(function(e) {
    var key = (e.event || "?") + "/" + (e.module || "?");
    if (!byModule[key]) byModule[key] = { total: 0, pass: 0, block: 0, msTotal: 0, msCount: 0, msMax: 0, blocks: [] };
    var m = byModule[key];
    m.total++;
    if (e.result === "block" || e.result === "deny") {
      m.block++;
      if (m.blocks.length < 3) {
        m.blocks.push({ ts: e.ts || "", tool: e.tool || "", reason: (e.reason || "").substring(0, 120) });
      }
    } else { m.pass++; }
    if (typeof e.ms === "number") { m.msTotal += e.ms; m.msCount++; if (e.ms > m.msMax) m.msMax = e.ms; }
  });

  // Coverage gaps
  var installedModules = {};
  var modsDir = path.join(HOOKS_DIR, "run-modules");
  ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"].forEach(function(evt) {
    var evDir = path.join(modsDir, evt);
    if (!fs.existsSync(evDir)) return;
    try {
      fs.readdirSync(evDir).forEach(function(f) {
        if (f.endsWith(".js") && !f.startsWith("_")) installedModules[evt + "/" + f.replace(".js", "")] = true;
        var sub = path.join(evDir, f);
        try {
          if (fs.statSync(sub).isDirectory() && !f.startsWith("_") && f !== "archive") {
            fs.readdirSync(sub).forEach(function(sf) {
              if (sf.endsWith(".js")) installedModules[evt + "/" + f + "/" + sf.replace(".js", "")] = true;
            });
          }
        } catch(err) {}
      });
    } catch(err) {}
  });
  var neverFired = Object.keys(installedModules).filter(function(k) { return !byModule[k]; });

  // Timing
  var timedMods = Object.keys(byModule).filter(function(k) { return byModule[k].msCount > 0; })
    .map(function(k) { var m = byModule[k]; return { module: k, avgMs: Math.round(m.msTotal / m.msCount), maxMs: m.msMax, calls: m.msCount }; })
    .sort(function(a, b) { return b.avgMs - a.avgMs; }).slice(0, 10);

  // Verdict
  var totalBlocks = entries.filter(function(e) { return e.result === "block" || e.result === "deny"; }).length;
  var blockRate = entries.length > 0 ? Math.round(totalBlocks / entries.length * 100) : 0;

  // --- JSON output ---
  if (jsonMode) {
    var blocksByModule = {};
    Object.keys(byModule).forEach(function(k) {
      var m = byModule[k];
      if (m.block > 0) blocksByModule[k] = { count: m.block, samples: m.blocks };
    });
    console.log(JSON.stringify({
      project: projectName,
      period: { from: firstTs, to: lastTs },
      entries: entries.length,
      events: byEvent,
      blocks: blocksByModule,
      coverage: {
        installed: Object.keys(installedModules).length,
        fired: Object.keys(byModule).length,
        neverFired: neverFired
      },
      timing: timedMods,
      summary: { blockRate: blockRate, totalBlocks: totalBlocks }
    }, null, 2));
    return;
  }

  // --- Text output ---
  console.log("[hook-runner] Project Audit: " + projectName);
  console.log("========================\n");
  console.log("  Period: " + (firstTs ? firstTs.slice(0, 19) : "?") + " to " + (lastTs ? lastTs.slice(0, 19) : "?"));
  console.log("  Total entries: " + entries.length);

  console.log("\n  By event:");
  Object.keys(byEvent).sort().forEach(function(evt) {
    var ev = byEvent[evt];
    console.log("    " + evt + ": " + ev.total + " (" + ev.pass + " pass, " + ev.block + " block)");
  });

  var blockModules = Object.keys(byModule).filter(function(k) { return byModule[k].block > 0; });
  if (blockModules.length > 0) {
    console.log("\n  Blocks:");
    blockModules.sort(function(a, b) { return byModule[b].block - byModule[a].block; }).forEach(function(k) {
      var m = byModule[k];
      console.log("    " + k + ": " + m.block + " block(s)");
      m.blocks.forEach(function(b) {
        console.log("      [" + (b.ts ? b.ts.slice(11, 19) : "?") + "] " + b.tool);
        if (b.reason) console.log("        " + b.reason);
      });
    });
  } else { console.log("\n  Blocks: none"); }

  console.log("\n  Module coverage:");
  console.log("    Installed: " + Object.keys(installedModules).length);
  console.log("    Fired: " + Object.keys(byModule).length);
  console.log("    Never fired: " + neverFired.length);
  if (neverFired.length > 0 && neverFired.length <= 30) {
    var nfByEvent = {};
    neverFired.forEach(function(k) { var evt = k.split("/")[0]; if (!nfByEvent[evt]) nfByEvent[evt] = []; nfByEvent[evt].push(k.split("/").slice(1).join("/")); });
    Object.keys(nfByEvent).sort().forEach(function(evt) { console.log("    [" + evt + "] " + nfByEvent[evt].join(", ")); });
  }

  if (timedMods.length > 0) {
    console.log("\n  Timing (top 10 slowest):");
    timedMods.forEach(function(t) {
      var note = t.maxMs > 100 ? "  *** spike " + t.maxMs + "ms" : "";
      console.log("    " + t.module + "  avg:" + t.avgMs + "ms  (" + t.calls + " calls)" + note);
    });
  }

  console.log("\n  Summary:");
  console.log("    Block rate: " + blockRate + "% (" + totalBlocks + "/" + entries.length + ")");
  if (neverFired.length > Object.keys(installedModules).length * 0.5) {
    console.log("    WARNING: >50% modules never fired — session may have been too short");
  }
  if (blockRate > 20) {
    console.log("    NOTE: High block rate — check workflow config for this project");
  } else if (totalBlocks === 0) {
    console.log("    OK: No blocks — hooks are passing cleanly");
  }
  console.log("");
}

function cmdExport(args) {
  var outFile = null;
  for (var i = 0; i < args.length; i++) {
    if (args[i] === "--export" && args[i + 1] && args[i + 1].indexOf("--") !== 0) {
      outFile = args[i + 1]; break;
    }
  }
  if (!outFile) outFile = "modules-export.yaml";

  var EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop", "SessionStart"];
  var modulesDir = path.join(HOOKS_DIR, "run-modules");
  var lines = [];
  lines.push("# hook-runner module configuration (exported " + new Date().toISOString().slice(0, 10) + ")");
  lines.push("# Import: copy to ~/.claude/hooks/modules.yaml then run: node setup.js --sync");
  lines.push("");
  lines.push("source: grobomo/hook-runner");
  lines.push("branch: main");
  lines.push("");
  lines.push("modules:");

  var projectModules = {};

  for (var e = 0; e < EVENTS.length; e++) {
    var evt = EVENTS[e];
    var evtDir = path.join(modulesDir, evt);
    if (!fs.existsSync(evtDir)) continue;

    var globalMods = [];
    var entries = fs.readdirSync(evtDir);
    entries.sort();
    for (var f = 0; f < entries.length; f++) {
      var entry = entries[f];
      var full = path.join(evtDir, entry);
      if (entry.slice(-3) === ".js" && fs.statSync(full).isFile()) {
        globalMods.push(entry.replace(/\.js$/, ""));
      } else if (fs.statSync(full).isDirectory() && entry !== "archive") {
        // Project-scoped modules
        var projName = entry;
        if (!projectModules[projName]) projectModules[projName] = {};
        if (!projectModules[projName][evt]) projectModules[projName][evt] = [];
        var projFiles = fs.readdirSync(full).filter(function(pf) { return pf.slice(-3) === ".js"; }).sort();
        for (var pf = 0; pf < projFiles.length; pf++) {
          projectModules[projName][evt].push(projFiles[pf].replace(/\.js$/, ""));
        }
      }
    }

    if (globalMods.length > 0) {
      lines.push("  " + evt + ":");
      for (var g = 0; g < globalMods.length; g++) {
        lines.push("    - " + globalMods[g]);
      }
    }
  }

  // Project-scoped modules
  var projNames = Object.keys(projectModules).sort();
  if (projNames.length > 0) {
    lines.push("");
    lines.push("project_modules:");
    for (var p = 0; p < projNames.length; p++) {
      lines.push("  " + projNames[p] + ":");
      var projEvts = Object.keys(projectModules[projNames[p]]).sort();
      for (var pe = 0; pe < projEvts.length; pe++) {
        lines.push("    " + projEvts[pe] + ":");
        var mods = projectModules[projNames[p]][projEvts[pe]];
        for (var m = 0; m < mods.length; m++) {
          lines.push("      - " + mods[m]);
        }
      }
    }
  }

  lines.push("");
  var content = lines.join("\n");
  fs.writeFileSync(outFile, content);
  console.log("[hook-runner] Exported module config to " + outFile);
  console.log("  Share this file — others can import with: cp " + outFile + " ~/.claude/hooks/modules.yaml && node setup.js --sync");
}

function cmdTestModule(args) {
  var idx = args.indexOf("--test-module");
  var modPath = args[idx + 1];
  if (!modPath) {
    console.error("Usage: node setup.js --test-module <path-to-module.js> [--input <json-file>]");
    process.exit(1);
  }
  modPath = path.resolve(modPath);
  if (!fs.existsSync(modPath)) {
    console.error("Module not found: " + modPath);
    process.exit(1);
  }
  console.log("[hook-runner] Test Module");
  console.log("========================");
  console.log("  Module: " + modPath);

  // Load module
  var mod;
  try {
    mod = require(modPath);
  } catch (e) {
    console.error("  FAIL: could not load — " + e.message);
    process.exit(1);
  }
  if (typeof mod === "function") {
    console.log("  Loaded: exports function");
  } else if (typeof mod === "object" && mod !== null) {
    console.log("  Loaded: exports object (utility module)");
  } else {
    console.error("  FAIL: exports " + typeof mod + ", expected function or object");
    process.exit(1);
  }

  // Check headers
  var headerLines = fs.readFileSync(modPath, "utf-8").split("\n").slice(0, 5);
  var hasWhy = headerLines.some(function(l) { return /\/\/\s*WHY:/.test(l); });
  var hasWorkflow = headerLines.some(function(l) { return /\/\/\s*WORKFLOW:/.test(l); });
  console.log("  WHY comment: " + (hasWhy ? "yes" : "MISSING"));
  console.log("  WORKFLOW tag: " + (hasWorkflow ? headerLines.filter(function(l) { return /WORKFLOW:/.test(l); })[0].trim() : "MISSING"));
  console.log("");

  // Custom input or built-in samples
  var inputIdx = args.indexOf("--input");
  var customInputs = null;
  if (inputIdx !== -1 && args[inputIdx + 1]) {
    try {
      var raw = fs.readFileSync(args[inputIdx + 1], "utf-8");
      var parsed = JSON.parse(raw);
      customInputs = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      console.error("  Could not parse input file: " + e.message);
      process.exit(1);
    }
  }

  var sampleBase = path.join(process.cwd(), "src");
  var samples = customInputs || [
    { label: "Edit .js file", tool_name: "Edit", tool_input: { file_path: path.join(sampleBase, "index.js"), old_string: "foo", new_string: "bar" } },
    { label: "Write new file", tool_name: "Write", tool_input: { file_path: path.join(sampleBase, "out.txt"), content: "hello" } },
    { label: "Bash: git status", tool_name: "Bash", tool_input: { command: "git status" } },
    { label: "Bash: rm -rf", tool_name: "Bash", tool_input: { command: "rm -rf /tmp/stuff" } },
    { label: "Read file", tool_name: "Read", tool_input: { file_path: path.join(sampleBase, "README.md") } },
  ];

  if (typeof mod !== "function") {
    console.log("\n  Utility module — skipping invocation tests (not callable).");
    console.log("  Exports: " + Object.keys(mod).join(", "));
    return;
  }

  var runAsync = require("./run-async");
  var passed = 0, blocked = 0, errors = 0;

  function runNext(i) {
    if (i >= samples.length) {
      console.log("");
      console.log("  " + samples.length + " inputs: " + passed + " pass, " + blocked + " block, " + errors + " error");
      return;
    }
    var sample = samples[i];
    var label = sample.label || sample.tool_name + " " + (sample.tool_input.command || sample.tool_input.file_path || "").substring(0, 40);
    var t0 = Date.now();
    try {
      var result = mod(sample);
      if (runAsync.isThenable(result)) {
        runAsync.withTimeout(result, 4000, path.basename(modPath)).then(
          function(val) { printResult(label, val, null, Date.now() - t0); runNext(i + 1); },
          function(err) { printResult(label, null, err, Date.now() - t0); runNext(i + 1); }
        );
      } else {
        printResult(label, result, null, Date.now() - t0);
        runNext(i + 1);
      }
    } catch (e) {
      printResult(label, null, e, Date.now() - t0);
      runNext(i + 1);
    }
  }

  function printResult(label, result, err, ms) {
    if (err) {
      console.log("  ERROR [" + ms + "ms] " + label + " — " + err.message);
      errors++;
    } else if (result && result.decision) {
      console.log("  BLOCK [" + ms + "ms] " + label + " — " + (result.reason || "").substring(0, 80));
      blocked++;
    } else {
      console.log("  PASS  [" + ms + "ms] " + label);
      passed++;
    }
  }

  runNext(0);
}

function cmdWorkflow(args) {
  return require(path.join(__dirname, "workflow-cli.js"))(args);
}

// T486: Inter-project TODO dashboard
function cmdXref() {
  var auditPath = path.join(os.homedir(), ".claude", "audit", "inter-project-todo.jsonl");
  var projectsRoot = process.env.CLAUDE_PROJECTS_ROOT ||
    (process.env.CLAUDE_PROJECT_DIR ? path.dirname(process.env.CLAUDE_PROJECT_DIR) : "") || "";
  var XREF_PATTERN = /<!--\s*XREF:([^:]+):(\S+)\s+(\S+)\s*-->/;

  console.log("[hook-runner] Inter-Project TODO Dashboard");
  console.log("==========================================\n");

  // 1. Scan audit log
  var auditEntries = [];
  try {
    var auditLines = fs.readFileSync(auditPath, "utf-8").trim().split("\n");
    for (var ai = 0; ai < auditLines.length; ai++) {
      try { auditEntries.push(JSON.parse(auditLines[ai])); } catch(e) {}
    }
  } catch(e) { /* no audit log yet */ }

  console.log("Audit Log: " + auditEntries.length + " inter-project writes recorded");
  if (auditEntries.length > 0) {
    // Show last 10
    var recent = auditEntries.slice(-10);
    for (var ri = 0; ri < recent.length; ri++) {
      var e = recent[ri];
      var age = Math.round((Date.now() - new Date(e.ts).getTime()) / 86400000);
      console.log("  " + e.source_project + " → " + e.target_project +
        " | " + (e.task_ids || []).join(", ") + " | " + age + "d ago" +
        " | " + e.status);
    }
    if (auditEntries.length > 10) console.log("  ... and " + (auditEntries.length - 10) + " more");
  }

  // 2. Scan all projects for pending XREF items
  console.log("\nPending XREF Items Across Projects:");
  var totalPending = 0;
  if (projectsRoot) {
    try {
      var projects = fs.readdirSync(projectsRoot);
      for (var pi = 0; pi < projects.length; pi++) {
        var todoFile = path.join(projectsRoot, projects[pi], "TODO.md");
        try {
          var content = fs.readFileSync(todoFile, "utf-8");
          var lines = content.split("\n");
          var projectXrefs = [];
          for (var li = 0; li < lines.length; li++) {
            if (!/^- \[ \] /.test(lines[li])) continue;
            var m = lines[li].match(XREF_PATTERN);
            if (m) projectXrefs.push({ source: m[1], taskId: m[2], date: m[3], text: lines[li] });
          }
          // Also check section header
          var secIdx = content.indexOf("## Inbound Requests");
          if (secIdx === -1) secIdx = content.indexOf("## Inter-Project Requests");
          if (secIdx !== -1) {
            var secLines = content.slice(secIdx).split("\n");
            for (var si = 1; si < secLines.length; si++) {
              if (/^## /.test(secLines[si]) && si > 0) break;
              if (!/^- \[ \] /.test(secLines[si])) continue;
              if (!XREF_PATTERN.test(secLines[si])) {
                projectXrefs.push({ source: "section", taskId: "", date: "", text: secLines[si] });
              }
            }
          }
          if (projectXrefs.length > 0) {
            console.log("\n  " + projects[pi] + " (" + projectXrefs.length + " pending):");
            for (var xi = 0; xi < projectXrefs.length; xi++) {
              var x = projectXrefs[xi];
              console.log("    P0: " + x.text.replace(/^- \[ \] /, "").replace(/<!--.*?-->/, "").trim());
              if (x.source !== "section") console.log("        from: " + x.source + " | " + x.taskId + " | " + x.date);
            }
            totalPending += projectXrefs.length;
          }
        } catch(e) { /* no TODO.md or can't read */ }
      }
    } catch(e) { console.log("  ERROR: Cannot read projects root: " + projectsRoot); }
  }

  if (totalPending === 0) {
    console.log("  None — all clear!");
  }

  console.log("\n==========================================");
  console.log("[hook-runner] " + totalPending + " P0 items pending, " + auditEntries.length + " audit entries");
}

function main() {
  var args = process.argv.slice(2);
  var dryRun = args.indexOf("--dry-run") !== -1;
  var openMode = args.indexOf("--open") !== -1;

  if (args.indexOf("--help") !== -1 || args.indexOf("-h") !== -1) return cmdHelp();
  if (args.indexOf("--version") !== -1 || args.indexOf("-v") !== -1) { console.log("hook-runner v" + VERSION); return; }
  if (args.indexOf("--workflow") !== -1) return cmdWorkflow(args);
  if (args.indexOf("--upgrade") !== -1) return cmdUpgrade(args, dryRun);
  if (args.indexOf("--uninstall") !== -1) return cmdUninstall(args, dryRun);
  if (args.indexOf("--prune") !== -1) return cmdPrune(args, dryRun);
  if (args.indexOf("--lessons") !== -1) return cmdLessons(args);
  if (args.indexOf("--demo") !== -1) return require(path.join(__dirname, "demo.js"))();
  if (args.indexOf("--stats") !== -1) return cmdStats();
  if (args.indexOf("--export") !== -1) return cmdExport(args);
  if (args.indexOf("--perf") !== -1) return cmdPerf();
  if (args.indexOf("--list") !== -1) return cmdList();
  if (args.indexOf("--test-module") !== -1) return cmdTestModule(args);
  if (args.indexOf("--test") !== -1) return cmdTest(args);
  if (args.indexOf("--integrity") !== -1) return cmdIntegrity(args);
  if (args.indexOf("--preflight") !== -1) {
    var pfArgs = [path.join(__dirname, "preflight.js")];
    if (args.indexOf("--test") !== -1) pfArgs.push("--test");
    if (args.indexOf("--json") !== -1) pfArgs.push("--json");
    var pfResult = require("child_process").spawnSync(process.execPath, pfArgs, {
      stdio: "inherit", windowsHide: true
    });
    process.exit(pfResult.status || 0);
  }
  if (args.indexOf("--manifest") !== -1) {
    var mfResult = require("child_process").spawnSync(process.execPath,
      [path.join(__dirname, "generate-manifest.js")].concat(
        args.indexOf("--json") !== -1 ? ["--json"] : []
      ), { stdio: "inherit", windowsHide: true });
    process.exit(mfResult.status || 0);
  }
  if (args.indexOf("--snapshot") !== -1) {
    var snapArgs = args.slice(args.indexOf("--snapshot") + 1).filter(function(a) { return a.indexOf("--snapshot") === -1; });
    var snapResult = require("child_process").spawnSync(process.execPath,
      [path.join(__dirname, "snapshot.js")].concat(snapArgs.length ? snapArgs : ["create"]),
      { stdio: "inherit", windowsHide: true });
    process.exit(snapResult.status || 0);
  }
  if (args.indexOf("--health") !== -1) return cmdHealth();
  if (args.indexOf("--audit-project") !== -1) return cmdAuditProject(args);
  if (args.indexOf("--audit-project") !== -1) return cmdAuditProject(args);
  if (args.indexOf("--xref") !== -1) return cmdXref();
  if (args.indexOf("--sync") !== -1) return cmdSync(dryRun);

  // Default: setup wizard (with --report and --install as sub-modes)
  var reportOnly = args.indexOf("--report") !== -1;
  var analyzeMode = args.indexOf("--analyze") !== -1;
  if (analyzeMode) reportOnly = true; // --analyze implies --report
  var deepMode = args.indexOf("--deep") !== -1;
  var inputIdx = args.indexOf("--input");
  var inputFile = inputIdx !== -1 && inputIdx + 1 < args.length ? args[inputIdx + 1] : null;
  var autoYes = args.indexOf("--yes") !== -1 || args.indexOf("-y") !== -1;
  cmdWizard(reportOnly, dryRun, openMode, autoYes, analyzeMode, deepMode, inputFile);
}

// ============================================================
// Integrity Check
// ============================================================

// Decode .claude/projects/ encoded dir name back to a filesystem path.
// Encoding replaces \ / : . with - (lossy). Greedy: try joining segments
// left-to-right, checking which combinations exist on disk.
// e.g. "C--" + "Users-alice-projects-my-app" → $HOME + "\projects\my-app"
// e.g. "C--" + "Users-alice--config" → $HOME + "\.config" (-- mid-string = dot-prefix)
function decodeProjectDir(encoded) {
  // Drive letter: first segment before first -- is the drive letter
  var driveIdx = encoded.indexOf("--");
  if (driveIdx < 1) return null;
  var drive = encoded.substring(0, driveIdx) + ":";
  var rest = encoded.substring(driveIdx + 2); // skip the --
  if (!rest) return drive + path.sep;

  var segments = rest.split("-");
  // Greedy: accumulate segments, emit a path component when the path exists
  var current = drive + path.sep;
  var accum = segments[0];

  for (var i = 1; i < segments.length; i++) {
    // Empty segment means original had -- which encodes \. or \_ or other combos
    // Try both dot-prefix and underscore-prefix, pick whichever exists on disk
    if (segments[i] === "") {
      if (accum) {
        current = path.join(current, accum);
      }
      if (i + 1 < segments.length) {
        i++;
        // Try _prefix first (e.g. _grobomo), then .prefix (e.g. .claude)
        var withUnderscore = path.join(current, "_" + segments[i]);
        var withDot = path.join(current, "." + segments[i]);
        if (fs.existsSync(withUnderscore)) {
          accum = "_" + segments[i];
        } else {
          accum = "." + segments[i]; // default to dot-prefix
        }
      } else {
        accum = "";
      }
      continue;
    }

    // Try treating this - as a path separator
    var asDir = path.join(current, accum);
    if (fs.existsSync(asDir)) {
      // Also check if joining more segments would match a longer name
      var joined = accum + "-" + segments[i];
      var asJoined = path.join(current, joined);
      if (fs.existsSync(asJoined)) {
        // Prefer the longer match (e.g. "hook-runner" over "hook")
        accum = joined;
        continue;
      }
      // The dir exists and extending doesn't — emit this component
      current = asDir;
      accum = segments[i];
    } else {
      // Doesn't exist as dir — this - must be part of the name (hyphen or dot)
      accum = accum + "-" + segments[i];
    }
  }

  // Final component
  return path.join(current, accum);
}

function cmdIntegrity(args) {
  var crypto = require("crypto");
  var jsonMode = args.indexOf("--json") !== -1;
  var repoModDir = path.join(REPO_DIR, "modules");
  var liveModDir = path.join(HOOKS_DIR, "run-modules");
  var markerPath = path.join(HOOKS_DIR, ".hook-runner-repo");
  var events = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];

  function md5(filePath) {
    try { return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex"); }
    catch (e) { return null; }
  }

  var results = { files: { checked: 0, drifted: [], orphans: [], repaired: [] }, workflows: { enforced: [], violations: [] }, marker: null };

  // 1. Marker file
  if (fs.existsSync(markerPath)) {
    results.marker = fs.readFileSync(markerPath, "utf-8").trim();
  }
  if (!jsonMode) {
    console.log("[hook-runner] Integrity Check");
    console.log("========================");
    console.log("");
    console.log("Repo: " + REPO_DIR);
    console.log("Live: " + HOOKS_DIR);
    console.log("Marker: " + (results.marker || "(missing)"));
    console.log("");
  }

  // 2. File integrity
  for (var ei = 0; ei < events.length; ei++) {
    var repoEventDir = path.join(repoModDir, events[ei]);
    var liveEventDir = path.join(liveModDir, events[ei]);
    if (!fs.existsSync(repoEventDir)) continue;
    var entries;
    try { entries = fs.readdirSync(repoEventDir, { withFileTypes: true }); } catch (e) { continue; }

    for (var fi = 0; fi < entries.length; fi++) {
      var ent = entries[fi];
      if (ent.isFile() && ent.name.indexOf(".js") === ent.name.length - 3) {
        results.files.checked++;
        var rh = md5(path.join(repoEventDir, ent.name));
        var lh = md5(path.join(liveEventDir, ent.name));
        var label = events[ei] + "/" + ent.name;
        if (!lh) {
          results.files.drifted.push({ file: label, status: "missing" });
        } else if (rh !== lh) {
          results.files.drifted.push({ file: label, status: "content-drift" });
        }
      } else if (ent.isDirectory() && ent.name !== "archive" && ent.name.charAt(0) !== "_") {
        var subFiles;
        try { subFiles = fs.readdirSync(path.join(repoEventDir, ent.name)); } catch (e) { continue; }
        for (var si = 0; si < subFiles.length; si++) {
          if (subFiles[si].indexOf(".js") !== subFiles[si].length - 3) continue;
          results.files.checked++;
          var srh = md5(path.join(repoEventDir, ent.name, subFiles[si]));
          var slh = md5(path.join(liveEventDir, ent.name, subFiles[si]));
          var slabel = events[ei] + "/" + ent.name + "/" + subFiles[si];
          if (!slh) {
            results.files.drifted.push({ file: slabel, status: "missing" });
          } else if (srh !== slh) {
            results.files.drifted.push({ file: slabel, status: "content-drift" });
          }
        }
      }
    }

    // Detect orphans in live
    if (fs.existsSync(liveEventDir)) {
      var liveFiles;
      try { liveFiles = fs.readdirSync(liveEventDir); } catch (e) { liveFiles = []; }
      for (var li = 0; li < liveFiles.length; li++) {
        if (liveFiles[li].indexOf(".js") !== liveFiles[li].length - 3) continue;
        try { if (fs.statSync(path.join(liveEventDir, liveFiles[li])).isDirectory()) continue; } catch (e) { continue; }
        if (!fs.existsSync(path.join(repoEventDir, liveFiles[li]))) {
          results.files.orphans.push(events[ei] + "/" + liveFiles[li]);
        }
      }
    }
  }

  // Check runner files
  for (var ri = 0; ri < RUNNER_FILES.length; ri++) {
    results.files.checked++;
    var rrh = md5(path.join(REPO_DIR, RUNNER_FILES[ri]));
    var rlh = md5(path.join(HOOKS_DIR, RUNNER_FILES[ri]));
    if (rrh && rlh && rrh !== rlh) {
      results.files.drifted.push({ file: "runner:" + RUNNER_FILES[ri], status: "content-drift" });
    }
  }

  // 3. Workflow compliance
  try {
    var wf = require(path.join(REPO_DIR, "workflow.js"));
    var globalConfig = wf.readConfig(HOOKS_DIR);
    results.workflows.enforced = Object.keys(globalConfig).filter(function(k) { return globalConfig[k] === true; });

    // Check all known project dirs
    // Encoding in .claude/projects/ replaces \ / : . with - (lossy).
    // Greedy decode: split segments, join checking filesystem existence.
    var projectsDir = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "projects");
    if (fs.existsSync(projectsDir)) {
      var projDirs = fs.readdirSync(projectsDir);
      for (var pi = 0; pi < projDirs.length; pi++) {
        var decoded = decodeProjectDir(projDirs[pi]);
        if (!decoded || !fs.existsSync(decoded)) continue;
        var projConfigPath = path.join(decoded, "workflow-config.json");
        if (!fs.existsSync(projConfigPath)) continue;
        var projConfig;
        try { projConfig = JSON.parse(fs.readFileSync(projConfigPath, "utf-8")); } catch (e) { continue; }
        for (var wi = 0; wi < results.workflows.enforced.length; wi++) {
          var wfName = results.workflows.enforced[wi];
          if (projConfig[wfName] === false) {
            results.workflows.violations.push({ project: decoded, workflow: wfName });
          }
        }
      }
    }
  } catch (e) { /* workflow.js not available */ }

  // 4. Output
  if (jsonMode) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // File integrity
  console.log("File Integrity:");
  if (results.files.drifted.length === 0) {
    console.log("  [  OK] " + results.files.checked + " files verified, all match repo");
  } else {
    for (var di = 0; di < results.files.drifted.length; di++) {
      var d = results.files.drifted[di];
      console.log("  [DRIFT] " + d.file + " (" + d.status + ")");
    }
    console.log("  " + results.files.drifted.length + " of " + results.files.checked + " files drifted");
    console.log("  FIX: node setup.js --workflow sync-live");
  }
  if (results.files.orphans.length > 0) {
    console.log("");
    console.log("Orphans (in live, not in repo):");
    for (var oi = 0; oi < results.files.orphans.length; oi++) {
      console.log("  [WARN] " + results.files.orphans[oi]);
    }
  }

  // Workflow compliance
  console.log("");
  console.log("Workflow Compliance:");
  console.log("  Globally enforced: " + (results.workflows.enforced.length > 0 ? results.workflows.enforced.join(", ") : "(none)"));
  if (results.workflows.violations.length === 0) {
    console.log("  [  OK] No project-level overrides detected");
  } else {
    for (var vi = 0; vi < results.workflows.violations.length; vi++) {
      var v = results.workflows.violations[vi];
      console.log("  [BLOCK] " + v.project + " disables " + v.workflow);
    }
  }
  console.log("");
}

// ============================================================
// Health Check
// ============================================================

function healthCheck() {
  var results = [];
  var events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];

  // 1. Check runners exist (uses shared constant)
  var runners = RUNNER_FILES;
  for (var ri = 0; ri < runners.length; ri++) {
    var rPath = path.join(HOOKS_DIR, runners[ri]);
    if (fs.existsSync(rPath)) {
      results.push({ check: "runner", file: runners[ri], status: "ok" });
    } else {
      results.push({ check: "runner", file: runners[ri], status: "missing" });
    }
  }

  // 2. Check each module loads without error
  for (var ei = 0; ei < events.length; ei++) {
    var evt = events[ei];
    var modDir = path.join(HOOKS_DIR, "run-modules", evt);
    if (!fs.existsSync(modDir)) {
      results.push({ check: "dir", file: "run-modules/" + evt, status: "missing" });
      continue;
    }
    var files;
    try { files = fs.readdirSync(modDir); } catch(e) { continue; }
    for (var fi = 0; fi < files.length; fi++) {
      var f = files[fi];
      var fPath = path.join(modDir, f);
      var stat;
      try { stat = fs.statSync(fPath); } catch(e) { continue; }
      if (stat.isDirectory()) {
        // skip archive directories — contain superseded modules with stale deps
        if (f === "archive") continue;
        // project-scoped: check each file inside
        var subFiles;
        try { subFiles = fs.readdirSync(fPath); } catch(e) { continue; }
        for (var si = 0; si < subFiles.length; si++) {
          if (subFiles[si].slice(-3) !== ".js") continue;
          var subPath = path.join(fPath, subFiles[si]);
          try {
            var mod = require(subPath);
            if (typeof mod !== "function") {
              results.push({ check: "module", file: evt + "/" + f + "/" + subFiles[si], status: "bad-export", detail: "exports " + typeof mod + ", expected function" });
            } else {
              results.push({ check: "module", file: evt + "/" + f + "/" + subFiles[si], status: "ok" });
            }
          } catch(e) {
            results.push({ check: "module", file: evt + "/" + f + "/" + subFiles[si], status: "error", detail: e.message });
          }
        }
      } else if (f.slice(-3) === ".js") {
        try {
          var mod2 = require(fPath);
          // Underscore-prefix files are helpers (arrays, objects) — not gate modules
          if (f.charAt(0) === "_") {
            results.push({ check: "module", file: evt + "/" + f, status: "ok" });
          } else if (typeof mod2 !== "function") {
            results.push({ check: "module", file: evt + "/" + f, status: "bad-export", detail: "exports " + typeof mod2 + ", expected function" });
          } else {
            results.push({ check: "module", file: evt + "/" + f, status: "ok" });
          }
        } catch(e) {
          results.push({ check: "module", file: evt + "/" + f, status: "error", detail: e.message });
        }
      }
    }
  }

  // 3. Check module dependencies
  var loadModules = require("./load-modules");
  for (var di = 0; di < events.length; di++) {
    var depEvt = events[di];
    var depDir = path.join(HOOKS_DIR, "run-modules", depEvt);
    if (!fs.existsSync(depDir)) continue;
    var depFiles;
    try { depFiles = fs.readdirSync(depDir).filter(function(f) { return f.slice(-3) === ".js"; }); } catch(e) { continue; }
    var depAvailable = {};
    for (var dj = 0; dj < depFiles.length; dj++) depAvailable[depFiles[dj].replace(/\.js$/, "")] = true;
    for (var dk = 0; dk < depFiles.length; dk++) {
      var depPath = path.join(depDir, depFiles[dk]);
      var deps = loadModules.parseRequires(depPath);
      for (var dl = 0; dl < deps.length; dl++) {
        if (!depAvailable[deps[dl]]) {
          results.push({ check: "dependency", file: depEvt + "/" + depFiles[dk], status: "warning", detail: "requires " + deps[dl] + " (not installed)" });
        }
      }
    }
  }

  // 4. Check settings.json has hook entries
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      var settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      var hooks = settings.hooks || {};
      var hookEvents = Object.keys(hooks);
      if (hookEvents.length === 0) {
        results.push({ check: "settings", file: "settings.json", status: "warning", detail: "no hooks configured" });
      } else {
        results.push({ check: "settings", file: "settings.json", status: "ok", detail: hookEvents.length + " event(s) configured" });
      }
    } catch(e) {
      results.push({ check: "settings", file: "settings.json", status: "error", detail: "parse error: " + e.message });
    }
  } else {
    results.push({ check: "settings", file: "settings.json", status: "missing" });
  }

  // 5. Portable paths — flag modules with hardcoded absolute user paths
  var pathPatterns = [/C:\\Users\\/i, /\/home\/\w+/, /\/Users\/\w+/];
  // Modules that detect paths as their purpose — not false positives
  var pathCheckExclude = ["no-hardcoded-paths.js", "cwd-drift-detector.js", "portable-paths.js"];
  for (var pi = 0; pi < events.length; pi++) {
    var pEvt = events[pi];
    var pModDir = path.join(HOOKS_DIR, "run-modules", pEvt);
    if (!fs.existsSync(pModDir)) continue;
    var pFiles;
    try { pFiles = fs.readdirSync(pModDir).filter(function(f) { return f.slice(-3) === ".js"; }); } catch(e) { continue; }
    for (var pfi = 0; pfi < pFiles.length; pfi++) {
      if (pathCheckExclude.indexOf(pFiles[pfi]) >= 0) continue;
      var pPath = path.join(pModDir, pFiles[pfi]);
      var pContent;
      try { pContent = fs.readFileSync(pPath, "utf-8"); } catch(e) { continue; }
      for (var ppi = 0; ppi < pathPatterns.length; ppi++) {
        if (pathPatterns[ppi].test(pContent)) {
          results.push({ check: "portable-path", file: pEvt + "/" + pFiles[pfi], status: "warning", detail: "contains hardcoded absolute path" });
          break;
        }
      }
    }
  }

  // 6. Check hook log writability
  try {
    fs.accessSync(path.dirname(HOOK_LOG_PATH), fs.constants.W_OK);
    results.push({ check: "log", file: "hook-log.jsonl", status: "ok", detail: fs.existsSync(HOOK_LOG_PATH) ? "exists" : "will be created on first trigger" });
  } catch(e) {
    results.push({ check: "log", file: "hook-log.jsonl", status: "error", detail: "hooks dir not writable" });
  }

  // 7. Detect duplicate/redundant modules (e.g. shtd_branch-gate vs branch-pr-gate)
  for (var ddi = 0; ddi < events.length; ddi++) {
    var ddEvt = events[ddi];
    var ddDir = path.join(HOOKS_DIR, "run-modules", ddEvt);
    if (!fs.existsSync(ddDir)) continue;
    var ddFiles;
    try { ddFiles = fs.readdirSync(ddDir).filter(function(f) { return f.slice(-3) === ".js"; }).sort(); } catch(e) { continue; }
    // Build map of base names (strip shtd_ prefix, normalize hyphens)
    var baseNameMap = {};
    for (var ddf = 0; ddf < ddFiles.length; ddf++) {
      var name = ddFiles[ddf].replace(/\.js$/, "");
      // Normalize: strip shtd_ prefix, replace _ with -, remove -gate suffix variance
      var base = name.replace(/^shtd_/, "").replace(/_/g, "-");
      if (!baseNameMap[base]) baseNameMap[base] = [];
      baseNameMap[base].push(name);
    }
    var bk = Object.keys(baseNameMap);
    for (var bki = 0; bki < bk.length; bki++) {
      if (baseNameMap[bk[bki]].length > 1) {
        results.push({ check: "duplicate", file: ddEvt + "/" + baseNameMap[bk[bki]].join(", "), status: "warning", detail: "possible duplicates — similar base name '" + bk[bki] + "'" });
      }
    }
  }

  return results;
}

module.exports = { scanHooks: scanHooks, generateReport: generateReport, backupHooks: backupHooks, installRunners: installRunners, parseModulesYaml: parseModulesYaml, syncModules: syncModules, readHookStats: readHookStats, healthCheck: healthCheck, pruneLog: pruneLog, VERSION: VERSION, _decodeProjectDir: decodeProjectDir };

if (require.main === module) main();
