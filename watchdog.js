#!/usr/bin/env node
"use strict";
// hook-runner — Watchdog
// WHY: A test suite silently disabled shtd globally. No independent monitor caught it.
// This runs on a schedule (OS scheduler) to detect and auto-repair config drift.
//
// Exit codes: 0 = healthy, 1 = repaired (was broken, now fixed), 2 = broken (can't auto-fix)
// Output: JSON to stdout with check results
// Side effects: auto-repairs disabled workflows, writes .watchdog-alert, logs to watchdog-log.jsonl

var fs = require("fs");
var path = require("path");

// --- CLI args ---
var args = process.argv.slice(2);
function getArg(name) {
  var idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

var hooksDir = getArg("--hooks-dir") || path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks");
var configFile = getArg("--config") || path.join(hooksDir, "watchdog-config.json");

// --- Load watchdog config (what "healthy" looks like) ---
var DEFAULT_CONFIG = {
  required_workflows: ["shtd", "code-quality", "self-improvement", "session-management", "messaging-safety"],
  required_runners: [
    "run-pretooluse.js", "run-posttooluse.js", "run-stop.js",
    "run-sessionstart.js", "run-userpromptsubmit.js",
    "load-modules.js", "hook-log.js", "run-async.js",
    "workflow.js", "workflow-cli.js", "constants.js"
  ],
  required_modules: ["Stop/auto-continue.js", "PreToolUse/branch-pr-gate.js"]
};

function loadConfig() {
  if (fs.existsSync(configFile)) {
    try {
      return JSON.parse(fs.readFileSync(configFile, "utf-8"));
    } catch (e) {
      // corrupted config is itself a problem — use defaults
    }
  }
  return DEFAULT_CONFIG;
}

// --- Checks ---
function checkWorkflows(config) {
  var results = [];
  var wcPath = path.join(hooksDir, "workflow-config.json");

  if (!fs.existsSync(wcPath)) {
    results.push({ check: "workflow-config-exists", ok: false, detail: "workflow-config.json missing" });
    return results;
  }

  var wc;
  try {
    wc = JSON.parse(fs.readFileSync(wcPath, "utf-8"));
  } catch (e) {
    results.push({ check: "workflow-config-valid", ok: false, detail: "workflow-config.json is invalid JSON" });
    return results;
  }

  var requiredWorkflows = config.required_workflows || [];
  for (var i = 0; i < requiredWorkflows.length; i++) {
    var name = requiredWorkflows[i];
    if (wc[name] === true) {
      results.push({ check: "workflow-enabled", workflow: name, ok: true });
    } else {
      results.push({ check: "workflow-enabled", workflow: name, ok: false, detail: name + " is disabled (value: " + wc[name] + ")", repairable: true });
    }
  }

  // Check if ALL workflows are false (total shutdown) — repairable via per-workflow repair
  var keys = Object.keys(wc);
  var allFalse = keys.length > 0 && keys.every(function(k) { return wc[k] === false; });
  if (allFalse) {
    results.push({ check: "not-all-disabled", ok: false, detail: "All workflows are disabled — total shutdown detected", repairable: true });
  }

  return results;
}

function checkRunners(config) {
  var results = [];
  var runners = config.required_runners || [];
  for (var i = 0; i < runners.length; i++) {
    var runner = runners[i];
    var p = path.join(hooksDir, runner);
    if (fs.existsSync(p)) {
      results.push({ check: "runner-exists", file: runner, ok: true });
    } else {
      results.push({ check: "runner-exists", file: runner, ok: false, detail: runner + " missing from " + hooksDir });
    }
  }
  return results;
}

function checkModules(config) {
  var results = [];
  var modulesDir = path.join(hooksDir, "run-modules");
  var mods = config.required_modules || [];
  for (var i = 0; i < mods.length; i++) {
    var mod = mods[i];
    var p = path.join(modulesDir, mod);
    if (!fs.existsSync(p)) {
      results.push({ check: "module-exists", module: mod, ok: false, detail: mod + " missing" });
      continue;
    }
    // Verify it exports a function
    try {
      var m = require(p);
      if (typeof m === "function") {
        results.push({ check: "module-valid", module: mod, ok: true });
      } else {
        results.push({ check: "module-valid", module: mod, ok: false, detail: mod + " does not export a function" });
      }
    } catch (e) {
      results.push({ check: "module-valid", module: mod, ok: false, detail: mod + " failed to load: " + e.message });
    }
  }
  return results;
}

function checkSettings() {
  var results = [];
  var settingsPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) {
    results.push({ check: "settings-exists", ok: false, detail: "settings.json missing" });
    return results;
  }

  try {
    var settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    // Verify hooks array exists and has entries
    var hooks = settings.hooks || {};
    var events = Object.keys(hooks);
    if (events.length === 0) {
      results.push({ check: "settings-has-hooks", ok: false, detail: "No hooks configured in settings.json" });
    } else {
      results.push({ check: "settings-has-hooks", ok: true, detail: events.length + " hook events configured" });
    }

    // Verify hook commands reference existing files
    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      var entries = hooks[event] || [];
      for (var j = 0; j < entries.length; j++) {
        var cmd = entries[j].command || "";
        // Extract script path from "node /path/to/script.js"
        var match = cmd.match(/node\s+"?([^"\s]+\.js)"?/);
        if (match) {
          var scriptPath = match[1].replace(/\//g, path.sep);
          if (!fs.existsSync(scriptPath)) {
            results.push({ check: "hook-script-exists", ok: false, detail: event + ": script not found: " + scriptPath });
          }
        }
      }
    }
  } catch (e) {
    results.push({ check: "settings-valid", ok: false, detail: "settings.json parse error: " + e.message });
  }

  return results;
}

// --- Auto-repair ---
function repair(failures) {
  var repaired = [];
  var wcPath = path.join(hooksDir, "workflow-config.json");

  // Repair disabled workflows
  var workflowFailures = failures.filter(function(f) { return f.check === "workflow-enabled" && f.repairable; });
  if (workflowFailures.length > 0 && fs.existsSync(wcPath)) {
    try {
      var wc = JSON.parse(fs.readFileSync(wcPath, "utf-8"));
      for (var i = 0; i < workflowFailures.length; i++) {
        wc[workflowFailures[i].workflow] = true;
        repaired.push({ action: "enable-workflow", workflow: workflowFailures[i].workflow });
      }
      fs.writeFileSync(wcPath, JSON.stringify(wc, null, 2) + "\n");
    } catch (e) {
      // Can't repair corrupted JSON
    }
  }

  return repaired;
}

// --- Alert flag ---
function writeAlert(failures, repairs) {
  var alertPath = path.join(hooksDir, ".watchdog-alert");
  var alert = {
    timestamp: new Date().toISOString(),
    failures: failures.map(function(f) { return f.detail || f.check; }),
    repairs: repairs.map(function(r) { return (r.action + ": " + (r.workflow || r.file || "")).trim(); })
  };
  fs.writeFileSync(alertPath, JSON.stringify(alert, null, 2) + "\n");
}

// --- Logging ---
function appendLog(entry) {
  var logPath = path.join(hooksDir, "watchdog-log.jsonl");
  entry.timestamp = new Date().toISOString();
  var line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(logPath, line);
}

// --- Main ---
function main() {
  var config = loadConfig();
  var allResults = [];

  // Run all checks
  allResults = allResults.concat(checkWorkflows(config));
  allResults = allResults.concat(checkRunners(config));
  allResults = allResults.concat(checkModules(config));
  // Only check settings if not using a custom hooks dir (CI/test mode)
  if (!getArg("--hooks-dir")) {
    allResults = allResults.concat(checkSettings());
  }

  var failures = allResults.filter(function(r) { return !r.ok; });
  var exitCode = 0;
  var repairs = [];

  if (failures.length > 0) {
    // Attempt auto-repair
    repairs = repair(failures);

    // Determine exit code: 1 = repaired, 2 = broken (unrepairable failures remain)
    var unrepairableCount = failures.length - failures.filter(function(f) { return f.repairable; }).length;
    exitCode = unrepairableCount > 0 ? 2 : 1;

    // Write alert flag
    writeAlert(failures, repairs);
  }

  var output = {
    status: exitCode === 0 ? "healthy" : exitCode === 1 ? "repaired" : "broken",
    checks: allResults.length,
    passed: allResults.filter(function(r) { return r.ok; }).length,
    failed: failures.length,
    repaired: repairs.length,
    results: allResults,
    repairs: repairs
  };

  // Log
  appendLog({
    status: output.status,
    checks: output.checks,
    passed: output.passed,
    failed: output.failed,
    repaired: output.repaired,
    failures: failures.map(function(f) { return f.detail || f.check; }),
    repairs: repairs.map(function(r) { return (r.action + ": " + (r.workflow || "")).trim(); })
  });

  // JSON output
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exit(exitCode);
}

// --- Scheduler Integration (T125-T127) ---
var TASK_NAME = "HookRunnerWatchdog";
var isWindows = process.platform === "win32";

function getWatchdogScriptPath() {
  // Resolve to absolute path of this script
  return path.resolve(__dirname, "watchdog.js");
}

function getVbsWrapperPath() {
  return path.join(hooksDir, "watchdog-hidden.vbs");
}

function createVbsWrapper() {
  var nodePath = process.execPath;
  var scriptPath = getWatchdogScriptPath().replace(/\//g, "\\");
  var vbs = 'Set WshShell = CreateObject("WScript.Shell")\n' +
    'WshShell.Run "cmd /c ""' + nodePath + '"" ""' + scriptPath + '""""", 0, True\n';
  var vbsPath = getVbsWrapperPath();
  fs.writeFileSync(vbsPath, vbs);
  return vbsPath;
}

function cmdInstall() {
  var execSync = require("child_process").execSync;

  if (isWindows) {
    var vbsPath = createVbsWrapper();
    // Delete existing task if any
    try { execSync('schtasks /Delete /TN "' + TASK_NAME + '" /F', { stdio: "pipe" }); } catch(e) {}
    // Create task: every 10 minutes, starts immediately
    var cmd = 'schtasks /Create /TN "' + TASK_NAME + '" /TR "wscript.exe \\"' + vbsPath.replace(/\//g, "\\") + '\\"" /SC MINUTE /MO 10 /F';
    try {
      execSync(cmd, { stdio: "pipe" });
      console.log('Installed scheduled task "' + TASK_NAME + '" (every 10 min)');
      console.log("  VBS wrapper: " + vbsPath);
      console.log("  Script: " + getWatchdogScriptPath());
    } catch (e) {
      console.error("Failed to create scheduled task:", e.message);
      process.exit(2);
    }
  } else {
    // Linux/macOS: cron
    var scriptPath = getWatchdogScriptPath();
    var nodePath = process.execPath;
    var cronLine = "*/10 * * * * " + nodePath + " " + scriptPath + " > /dev/null 2>&1 # " + TASK_NAME;
    try {
      var crontab = "";
      try { crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" }); } catch(e) {}
      // Remove existing entry
      var lines = crontab.split("\n").filter(function(l) { return !l.includes(TASK_NAME); });
      lines.push(cronLine);
      var newCrontab = lines.filter(function(l) { return l.trim(); }).join("\n") + "\n";
      // WHY: Pipe via stdin to avoid shell injection from crontab content containing quotes
      require("child_process").execFileSync("crontab", ["-"], { input: newCrontab });
      console.log('Installed cron job "' + TASK_NAME + '" (every 10 min)');
      console.log("  Script: " + scriptPath);
    } catch (e) {
      console.error("Failed to install cron job:", e.message);
      process.exit(2);
    }
  }
  process.exit(0);
}

function cmdUninstall() {
  var execSync = require("child_process").execSync;

  if (isWindows) {
    try {
      execSync('schtasks /Delete /TN "' + TASK_NAME + '" /F', { stdio: "pipe" });
      console.log('Removed scheduled task "' + TASK_NAME + '"');
    } catch (e) {
      console.log('Task "' + TASK_NAME + '" not found (already removed)');
    }
    // Clean up VBS wrapper
    var vbsPath = getVbsWrapperPath();
    if (fs.existsSync(vbsPath)) fs.unlinkSync(vbsPath);
  } else {
    try {
      var crontab = "";
      try { crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" }); } catch(e) {}
      var lines = crontab.split("\n").filter(function(l) { return !l.includes(TASK_NAME); });
      var newCrontab = lines.filter(function(l) { return l.trim(); }).join("\n") + "\n";
      // WHY: Pipe via stdin to avoid shell injection from crontab content containing quotes
      require("child_process").execFileSync("crontab", ["-"], { input: newCrontab });
      console.log('Removed cron job "' + TASK_NAME + '"');
    } catch (e) {
      console.log('Cron job "' + TASK_NAME + '" not found (already removed)');
    }
  }
  process.exit(0);
}

function cmdStatus() {
  var execSync = require("child_process").execSync;

  console.log("=== Watchdog Status ===");

  // Check scheduler registration
  var registered = false;
  if (isWindows) {
    try {
      var out = execSync('schtasks /Query /TN "' + TASK_NAME + '" /FO LIST 2>&1', { encoding: "utf-8" });
      registered = true;
      var statusMatch = out.match(/Status:\s*(.+)/);
      var nextMatch = out.match(/Next Run Time:\s*(.+)/);
      var lastMatch = out.match(/Last Run Time:\s*(.+)/);
      console.log("  Scheduler: registered");
      if (statusMatch) console.log("  Task status: " + statusMatch[1].trim());
      if (lastMatch) console.log("  Last run: " + lastMatch[1].trim());
      if (nextMatch) console.log("  Next run: " + nextMatch[1].trim());
    } catch (e) {
      console.log("  Scheduler: not registered");
    }
  } else {
    try {
      var crontab = execSync("crontab -l 2>/dev/null", { encoding: "utf-8" });
      if (crontab.includes(TASK_NAME)) {
        registered = true;
        console.log("  Scheduler: registered (cron)");
      } else {
        console.log("  Scheduler: not registered");
      }
    } catch (e) {
      console.log("  Scheduler: not registered");
    }
  }

  // Check last log entry
  var logPath = path.join(hooksDir, "watchdog-log.jsonl");
  if (fs.existsSync(logPath)) {
    var lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    if (lines.length > 0) {
      try {
        var last = JSON.parse(lines[lines.length - 1]);
        console.log("  Last check: " + last.timestamp + " — " + last.status + " (" + last.passed + "/" + last.checks + " passed)");
      } catch(e) {}
    }
    console.log("  Log entries: " + lines.length);
  } else {
    console.log("  Log: no entries yet");
  }

  // Check alert flag
  var alertPath = path.join(hooksDir, ".watchdog-alert");
  if (fs.existsSync(alertPath)) {
    try {
      var alert = JSON.parse(fs.readFileSync(alertPath, "utf-8"));
      console.log("  ALERT: " + alert.timestamp + " — " + alert.failures.join(", "));
    } catch(e) {
      console.log("  ALERT: flag exists but unreadable");
    }
  }

  process.exit(registered ? 0 : 1);
}

// --- Log viewer (T129) ---
function cmdLog() {
  var logPath = path.join(hooksDir, "watchdog-log.jsonl");
  if (!fs.existsSync(logPath)) {
    console.log("No watchdog log found.");
    process.exit(0);
  }

  var count = parseInt(getArg("--last") || "20", 10);
  var lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
  var recent = lines.slice(-count);

  console.log("=== Watchdog Log (last " + recent.length + " of " + lines.length + ") ===");
  for (var i = 0; i < recent.length; i++) {
    try {
      var e = JSON.parse(recent[i]);
      var icon = e.status === "healthy" ? "OK" : e.status === "repaired" ? "REPAIRED" : "BROKEN";
      var detail = e.failures && e.failures.length > 0 ? " — " + e.failures.join(", ") : "";
      console.log("  " + e.timestamp + "  [" + icon + "]  " + e.passed + "/" + e.checks + " checks" + detail);
    } catch(e) {}
  }
  process.exit(0);
}

// --- CLI dispatch ---
if (args.includes("--install")) { cmdInstall(); }
else if (args.includes("--uninstall")) { cmdUninstall(); }
else if (args.includes("--status")) { cmdStatus(); }
else if (args.includes("--log")) { cmdLog(); }
else { main(); }
