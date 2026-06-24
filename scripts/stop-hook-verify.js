#!/usr/bin/env node
"use strict";
// T759: Stop hook verification + self-healing
// Run after any stop hook change to verify it's working.
// Also called by SessionStart to catch overnight breakage.
//
// Usage:
//   node scripts/stop-hook-verify.js           # full verify + auto-fix
//   node scripts/stop-hook-verify.js --json     # machine-readable output
//   node scripts/stop-hook-verify.js --fix      # fix problems found
//   node scripts/stop-hook-verify.js --summary  # one-line status for injection

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var SETTINGS_PATH = path.join(HOME, ".claude", "settings.json");
var HEALTH_LOG = path.join(HOOKS_DIR, "hook-health.jsonl");
var HOOK_LOG = path.join(HOOKS_DIR, "hook-log.jsonl");

var args = process.argv.slice(2);
var jsonMode = args.indexOf("--json") !== -1;
var fixMode = args.indexOf("--fix") !== -1;
var summaryMode = args.indexOf("--summary") !== -1;

function ago(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + "s ago";
  if (ms < 3600000) return Math.round(ms / 60000) + "m ago";
  if (ms < 86400000) return Math.round(ms / 3600000) + "h ago";
  return Math.round(ms / 86400000) + "d ago";
}

function localTime(isoStr) {
  try { return new Date(isoStr).toLocaleTimeString(); } catch (e) { return isoStr; }
}

var checks = [];
var fixes = [];

// === CHECK 1: Settings.json has Stop hook with timeout >= 30 ===
function checkSettings() {
  try {
    var settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    if (!settings.hooks || !settings.hooks.Stop || settings.hooks.Stop.length === 0) {
      checks.push({ name: "settings-stop-hook", ok: false, detail: "No Stop hook in settings.json", fixable: true });
      return;
    }
    var stopHook = settings.hooks.Stop[0];
    if (!stopHook.hooks || stopHook.hooks.length === 0) {
      checks.push({ name: "settings-stop-command", ok: false, detail: "Stop hook has no commands", fixable: false });
      return;
    }
    var cmd = stopHook.hooks[0];
    if (cmd.timeout < 30) {
      checks.push({ name: "settings-timeout", ok: false, detail: "Stop timeout=" + cmd.timeout + "s (need 30+)", fixable: true, current: cmd.timeout });
      fixes.push({ type: "timeout", from: cmd.timeout, to: 30 });
    } else {
      checks.push({ name: "settings-timeout", ok: true, detail: "timeout=" + cmd.timeout + "s" });
    }
    if (cmd.command && cmd.command.indexOf("run-stop.js") !== -1) {
      checks.push({ name: "settings-command", ok: true, detail: "points to run-stop.js" });
    } else {
      checks.push({ name: "settings-command", ok: false, detail: "command doesn't reference run-stop.js: " + (cmd.command || "").slice(0, 60) });
    }
  } catch (e) {
    checks.push({ name: "settings-parse", ok: false, detail: "Can't read settings.json: " + e.message });
  }
}

// === CHECK 2: run-stop.js exists and has no exit(0) ===
function checkRunStop() {
  var runStopPath = path.join(HOOKS_DIR, "run-stop.js");
  if (!fs.existsSync(runStopPath)) {
    checks.push({ name: "run-stop-exists", ok: false, detail: "run-stop.js missing from " + HOOKS_DIR, fixable: true });
    return;
  }
  checks.push({ name: "run-stop-exists", ok: true });

  var content = fs.readFileSync(runStopPath, "utf-8");
  // Check for exit(0) outside the re-entrant guard
  var lines = content.split("\n");
  var exitZeroLines = [];
  for (var i = 0; i < lines.length; i++) {
    if (/process\.exit\s*\(\s*0\s*\)/.test(lines[i])) {
      // Allow the re-entrant guard (it's the only acceptable exit(0))
      if (!/re-entrant|stop_hook_active/.test(lines[Math.max(0, i - 3)] + lines[Math.max(0, i - 2)] + lines[Math.max(0, i - 1)] + lines[i])) {
        exitZeroLines.push(i + 1);
      }
    }
  }
  if (exitZeroLines.length > 0) {
    checks.push({ name: "no-exit-zero", ok: false, detail: "exit(0) at lines " + exitZeroLines.join(", ") + " — makes hook invisible in TUI", fixable: true });
  } else {
    checks.push({ name: "no-exit-zero", ok: true });
  }

  // Check required modules
  var requires = ["load-modules", "hook-log", "hook-debug"];
  for (var r = 0; r < requires.length; r++) {
    var reqPath = path.join(HOOKS_DIR, requires[r] + ".js");
    if (!fs.existsSync(reqPath)) {
      checks.push({ name: "require-" + requires[r], ok: false, detail: requires[r] + ".js missing", fixable: true });
    } else {
      checks.push({ name: "require-" + requires[r], ok: true });
    }
  }
}

// === CHECK 3: Stop modules exist in 1-haiku/ ===
function checkModules() {
  var haikuDir = path.join(HOOKS_DIR, "run-modules", "Stop", "1-haiku");
  if (!fs.existsSync(haikuDir)) {
    checks.push({ name: "haiku-dir", ok: false, detail: "Stop/1-haiku/ directory missing" });
    return;
  }
  var modules = fs.readdirSync(haikuDir).filter(function(f) { return f.endsWith(".js") && !f.endsWith(".pending"); });
  checks.push({ name: "haiku-modules", ok: modules.length > 0, detail: modules.length + " modules: " + modules.join(", ") });

  // Verify each module loads
  for (var i = 0; i < modules.length; i++) {
    try {
      require(path.join(haikuDir, modules[i]));
      checks.push({ name: "load-" + modules[i], ok: true });
    } catch (e) {
      checks.push({ name: "load-" + modules[i], ok: false, detail: e.message.slice(0, 100) });
    }
  }
}

// === CHECK 4: Last stop hook actually fired recently ===
function checkLastFired() {
  if (!fs.existsSync(HEALTH_LOG)) {
    checks.push({ name: "last-fired", ok: false, detail: "No hook-health.jsonl — stop hook may never have fired" });
    return;
  }
  var lines = fs.readFileSync(HEALTH_LOG, "utf-8").trim().split("\n");
  var lastStop = null;
  for (var i = lines.length - 1; i >= 0; i--) {
    try {
      var entry = JSON.parse(lines[i]);
      if (entry.runner === "run-stop.js") { lastStop = entry; break; }
    } catch (e) {}
  }
  if (!lastStop) {
    checks.push({ name: "last-fired", ok: false, detail: "No run-stop.js entries in hook-health.jsonl" });
    return;
  }
  var ageMs = Date.now() - new Date(lastStop.ts).getTime();
  var wasVisible = lastStop.exit === 1 && lastStop.stdout > 0;
  checks.push({
    name: "last-fired",
    ok: wasVisible,
    detail: (wasVisible ? "VISIBLE" : "INVISIBLE (exit=" + lastStop.exit + " stdout=" + lastStop.stdout + ")") +
      " — " + ago(ageMs) + " (" + localTime(lastStop.ts) + ") " + lastStop.ms + "ms"
  });

  // Check for pattern of invisible stops
  var recentStops = [];
  for (var j = lines.length - 1; j >= Math.max(0, lines.length - 20); j--) {
    try {
      var e = JSON.parse(lines[j]);
      if (e.runner === "run-stop.js") recentStops.push(e);
    } catch (ex) {}
  }
  var invisibleCount = recentStops.filter(function(s) { return s.exit === 0 || s.stdout === 0; }).length;
  if (invisibleCount > 0 && recentStops.length > 0) {
    checks.push({
      name: "invisible-ratio",
      ok: invisibleCount === 0,
      detail: invisibleCount + "/" + recentStops.length + " recent stops were invisible"
    });
  }
}

// === CHECK 5: Haiku proxy is reachable ===
function checkProxy() {
  try {
    var result = cp.execSync("curl -s -m 3 http://127.0.0.1:4100/health", { encoding: "utf-8", windowsHide: true, timeout: 5000 });
    var health = JSON.parse(result);
    checks.push({ name: "proxy-health", ok: health.status === "ok", detail: "uptime=" + (health.uptime_human || "?") + " requests=" + (health.requests || 0) });
  } catch (e) {
    checks.push({ name: "proxy-health", ok: false, detail: "Proxy at :4100 unreachable — Haiku calls will fail", fixable: true });
  }
}

// === AUTO-FIX ===
function applyFixes() {
  var applied = [];
  for (var i = 0; i < fixes.length; i++) {
    var fix = fixes[i];
    if (fix.type === "timeout") {
      try {
        var settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
        settings.hooks.Stop.forEach(function(entry) {
          if (entry.hooks) entry.hooks.forEach(function(h) {
            if (h.timeout < 30) h.timeout = 30;
          });
        });
        fs.copyFileSync(SETTINGS_PATH, SETTINGS_PATH + ".bak." + Date.now());
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
        applied.push("timeout " + fix.from + "→30s");
      } catch (e) {
        applied.push("timeout fix FAILED: " + e.message);
      }
    }
  }
  return applied;
}

// === RUN ===
checkSettings();
checkRunStop();
checkModules();
checkLastFired();
checkProxy();

var failures = checks.filter(function(c) { return !c.ok; });
var status = failures.length === 0 ? "HEALTHY" : "BROKEN (" + failures.length + " issues)";

if (fixMode && fixes.length > 0) {
  var applied = applyFixes();
  status += " — FIXED: " + applied.join(", ");
}

if (summaryMode) {
  // One-line for session injection
  if (failures.length === 0) {
    process.stdout.write("Stop hook: OK\n");
  } else {
    process.stdout.write("Stop hook: " + failures.length + " ISSUES — " + failures.map(function(f) { return f.name + ": " + f.detail; }).join("; ") + "\n");
  }
  process.exit(failures.length > 0 ? 1 : 0);
}

if (jsonMode) {
  process.stdout.write(JSON.stringify({ status: status, checks: checks, fixes: fixes }, null, 2) + "\n");
} else {
  console.log("=== Stop Hook Verification ===");
  console.log("Status: " + status);
  console.log("");
  for (var c = 0; c < checks.length; c++) {
    var ch = checks[c];
    console.log("  " + (ch.ok ? "OK" : "FAIL") + "  " + ch.name + (ch.detail ? " — " + ch.detail : ""));
  }
  if (failures.length > 0 && !fixMode) {
    console.log("\nRun with --fix to auto-repair fixable issues.");
  }
}

process.exit(failures.length > 0 ? 1 : 0);
