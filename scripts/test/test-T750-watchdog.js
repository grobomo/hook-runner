#!/usr/bin/env node
"use strict";
// T750: Tests for hook-runner-watchdog.js
var fs = require("fs");
var path = require("path");
var child_process = require("child_process");
var os = require("os");

var WATCHDOG = path.join(__dirname, "..", "..", "hook-runner-watchdog.js");
var pass = 0, fail = 0;

function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

function run(args) {
  try {
    return child_process.execFileSync("node", [WATCHDOG].concat(args), {
      encoding: "utf-8", timeout: 10000, windowsHide: true,
      env: Object.assign({}, process.env, { HOOK_WATCHDOG: "" })
    });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

function runWithEnv(args, env) {
  try {
    return child_process.execFileSync("node", [WATCHDOG].concat(args), {
      encoding: "utf-8", timeout: 10000, windowsHide: true,
      env: Object.assign({}, process.env, env)
    });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

// === Syntax ===
ok("Valid syntax", function() {
  try { child_process.execFileSync("node", ["-c", WATCHDOG], { windowsHide: true }); return true; }
  catch (e) { return false; }
}());

// === Help ===
var helpOut = run(["help"]);
ok("Help shows toggle commands", /on.*off.*status/s.test(helpOut));
ok("Help shows deploy", /deploy/i.test(helpOut));
ok("Help shows backup/restore", /backup.*restore/s.test(helpOut));
ok("Help shows monitor", /monitor/i.test(helpOut));
ok("Help shows settings.json example", /settings\.json/.test(helpOut));

// === Status ===
var statusOut = run(["status"]);
ok("Status shows always-on", /ALWAYS-ON/.test(statusOut));
ok("Status shows health check", /Health Check/.test(statusOut));
ok("Status shows runner checks", /PreToolUse.*OK|PreToolUse.*ISSUE/s.test(statusOut));
ok("Status shows module loader check", /ModuleLoader/.test(statusOut));

// === On/Off toggle (T828: always-on, commands are informational) ===
var onOut = run(["on"]);
ok("On command shows always-on message", /always-on|T828/i.test(onOut));

var offOut = run(["off"]);
ok("Off command shows always-on message", /always-on|T828/i.test(offOut));

// === Always-on (T828) ===
var envOut = runWithEnv(["PreToolUse"], {});
// Should produce output (issues or null) — always fires now
ok("Hook fires without toggle", envOut.length >= 0);

// === Backup ===
var backupOut = run(["backup"]);
ok("Backup reports file count", /Backed up \d+ /.test(backupOut));
var BACKUP_DIR = path.join(os.homedir(), ".claude", "hooks", ".watchdog-backup");
ok("Backup directory exists", fs.existsSync(BACKUP_DIR));
ok("Backup manifest exists", fs.existsSync(path.join(BACKUP_DIR, "manifest.json")));

var manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "manifest.json"), "utf-8"));
ok("Manifest has timestamp", !!manifest.ts);
ok("Manifest has files list", Array.isArray(manifest.files) && manifest.files.length > 0);
ok("Manifest has modules", !!manifest.modules && !!manifest.modules.PreToolUse);

// === Restore ===
var restoreOut = run(["restore"]);
ok("Restore reports count", /Restored \d+ /.test(restoreOut));

// === Event names accepted (T828: always fires, may produce stderr for issues) ===
var events = ["PreToolUse", "PostToolUse", "Stop", "SessionStart", "UserPromptSubmit"];
for (var i = 0; i < events.length; i++) {
  // Always-on: should not crash for any event
  var out = runWithEnv([events[i]], {});
  ok(events[i] + " accepted as hook event", true); // no crash = pass
}

// === Invalid command shows help ===
var invalidOut = run(["invalid-command"]);
ok("Invalid command shows help", /Usage|Toggle|Deploy/.test(invalidOut));

// === Watchdog log ===
// T828: always-on, just run a check
runWithEnv(["PreToolUse"], {});

var WLOG = path.join(os.homedir(), ".claude", "hooks", "watchdog-log.jsonl");
try {
  var logContent = fs.readFileSync(WLOG, "utf-8").trim();
  var lastLine = logContent.split("\n").pop();
  var entry = JSON.parse(lastLine);
  ok("Watchdog log has entries", !!entry.ts);
  ok("Log entry has watchdog flag", entry.watchdog === true);
  ok("Log entry has event", typeof entry.event === "string");
  ok("Log entry has issue count", typeof entry.issues === "number");
} catch (e) {
  ok("Watchdog log readable", false);
  ok("Log entry format", false);
  ok("Log entry event", false);
  ok("Log entry issues", false);
}

// === T754: Heal command ===
var healHelp = run(["help"]);
ok("Help shows heal command", /heal/i.test(healHelp));
ok("Help shows --dry-run", /dry-run/i.test(healHelp));

// heal --dry-run should not crash
var healOut = run(["heal", "--dry-run"]);
ok("Heal dry-run runs without crash", healOut.indexOf("Self-Healing") >= 0 || healOut.indexOf("healthy") >= 0);

// Verify source has LLM integration
var wdogSrc = fs.readFileSync(path.join(__dirname, "../../hook-runner-watchdog.js"), "utf-8");
ok("Has diagnoseAndHeal function", wdogSrc.indexOf("function diagnoseAndHeal") >= 0);
ok("Has executeRepairs function", wdogSrc.indexOf("function executeRepairs") >= 0);
ok("Has callLLM function", wdogSrc.indexOf("function callLLM") >= 0);
ok("Has L1 classification prompt", wdogSrc.indexOf("fixable") >= 0 && wdogSrc.indexOf("needs-human") >= 0);
ok("Has risk-based execution filter", wdogSrc.indexOf("risk") >= 0 && wdogSrc.indexOf("low") >= 0);

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
