"use strict";
// Test T843: dispatcher-cron-check

var passed = 0, failed = 0;
function ok(label, condition) {
  if (condition) { passed++; console.log("  PASS: " + label); }
  else { failed++; console.log("  FAIL: " + label); }
}

var origCwd = process.cwd;
var origEnv = Object.assign({}, process.env);
var origStderr = process.stderr.write;
var stderrOutput = "";

function captureStderr() {
  stderrOutput = "";
  process.stderr.write = function(s) { stderrOutput += s; return true; };
}
function restoreStderr() {
  process.stderr.write = origStderr;
}

function setDispatcherCwd() {
  process.env.CLAUDE_PROJECT_DIR = "/tmp/projects/request-tracker";
}
function setNonDispatcherCwd() {
  process.env.CLAUDE_PROJECT_DIR = "/tmp/projects/imsva-upgrade";
}
function restore() {
  process.cwd = origCwd;
  delete process.env.CLAUDE_PROJECT_DIR;
  restoreStderr();
}

// Load in test mode
process.env.HOOK_RUNNER_TEST = "1";
var mod = require("../../modules/SessionStart/dispatcher-cron-check.js");

console.log("=== dispatcher-cron-check tests ===\n");

console.log("--- Module contract ---");
ok("exports a function", typeof mod === "function");
ok("returns null in test mode", mod({}) === null);

// Re-load without test mode
delete process.env.HOOK_RUNNER_TEST;
delete require.cache[require.resolve("../../modules/SessionStart/dispatcher-cron-check.js")];
mod = require("../../modules/SessionStart/dispatcher-cron-check.js");

console.log("\n--- Non-dispatcher project ---");
setNonDispatcherCwd();
captureStderr();
ok("returns null for non-dispatcher", mod({}) === null);
ok("no stderr output", stderrOutput === "");
restore();

console.log("\n--- Dispatcher project ---");
setDispatcherCwd();
captureStderr();
var r = mod({});
ok("returns null (non-blocking)", r === null);
ok("emits to stderr", stderrOutput.length > 0);
ok("mentions CronCreate", stderrOutput.indexOf("CronCreate") >= 0);
ok("mentions heartbeat", stderrOutput.indexOf("heartbeat") >= 0);
ok("mentions manage.py poll", stderrOutput.indexOf("manage.py poll") >= 0);
ok("mentions supervise", stderrOutput.indexOf("supervise") >= 0);
ok("mentions 3 minutes", stderrOutput.indexOf("*/3") >= 0);
ok("mentions fleet API", stderrOutput.indexOf("fleet") >= 0);
ok("warns against Stable Monitoring", stderrOutput.indexOf("Stable. Monitoring.") >= 0);
ok("says do not ask", stderrOutput.indexOf("Do NOT ask") >= 0);
restore();

console.log("\n--- Windows path ---");
process.env.CLAUDE_PROJECT_DIR = "C:\\Users\\user\\projects\\request-tracker";
captureStderr();
ok("Windows path detected", mod({}) === null && stderrOutput.length > 0);
restore();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
