"use strict";
// Test T815: dispatch-spawn-check

var passed = 0, failed = 0;
function ok(label, condition) {
  if (condition) { passed++; console.log("  PASS: " + label); }
  else { failed++; console.log("  FAIL: " + label); }
}

var origCwd = process.cwd;
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
  process.cwd = function() { return "/tmp/projects/request-tracker"; };
}
function setNonDispatcherCwd() {
  process.cwd = function() { return "/tmp/projects/hook-runner"; };
}
function restore() {
  process.cwd = origCwd;
  restoreStderr();
}

process.env.HOOK_RUNNER_TEST = "1";
var mod = require("../../modules/PostToolUse/dispatch-spawn-check.js");

console.log("=== dispatch-spawn-check tests ===\n");

console.log("--- Module contract ---");
ok("exports a function", typeof mod === "function");
ok("returns null in test mode", mod({ tool_name: "Bash", tool_input: { command: "python manage.py poll" }, tool_result: "dispatched to hook-runner" }) === null);

delete process.env.HOOK_RUNNER_TEST;
delete require.cache[require.resolve("../../modules/PostToolUse/dispatch-spawn-check.js")];
mod = require("../../modules/PostToolUse/dispatch-spawn-check.js");

console.log("\n--- Non-dispatcher project ---");
setNonDispatcherCwd();
captureStderr();
ok("non-dispatcher passes", mod({ tool_name: "Bash", tool_input: { command: "python manage.py poll" }, tool_result: "dispatched to hook-runner" }) === null);
ok("no stderr from non-dispatcher", stderrOutput === "");
restore();

console.log("\n--- Non-Bash tool ---");
setDispatcherCwd();
captureStderr();
ok("Read passes", mod({ tool_name: "Read", tool_input: {} }) === null);
ok("Edit passes", mod({ tool_name: "Edit", tool_input: {} }) === null);
restore();

console.log("\n--- Non-poll commands ---");
setDispatcherCwd();
captureStderr();
ok("ls passes silently", mod({ tool_name: "Bash", tool_input: { command: "ls -la" }, tool_result: "total 42\n..." }) === null);
ok("no stderr for ls", stderrOutput === "");
restore();

console.log("\n--- Poll with no dispatches ---");
setDispatcherCwd();
captureStderr();
var r = mod({ tool_name: "Bash", tool_input: { command: "python manage.py poll" }, tool_result: "All requests processed. No pending items." });
ok("returns null", r === null);
ok("no stderr when clean", stderrOutput === "");
restore();

console.log("\n--- Poll with dispatches ---");
setDispatcherCwd();
captureStderr();
r = mod({ tool_name: "Bash", tool_input: { command: "python manage.py poll" }, tool_result: "Dispatched to hook-runner: T850 fix gate\nDispatching for imsva-upgrade: run tests" });
ok("returns null (non-blocking)", r === null);
ok("emits stderr advisory", stderrOutput.length > 0);
ok("mentions hook-runner", stderrOutput.indexOf("hook-runner") >= 0);
ok("mentions imsva-upgrade", stderrOutput.indexOf("imsva-upgrade") >= 0);
ok("mentions fleet API", stderrOutput.indexOf("fleet") >= 0);
ok("mentions spawn", stderrOutput.indexOf("spawn") >= 0);
restore();

console.log("\n--- Poll with pending TODO ---");
setDispatcherCwd();
captureStderr();
r = mod({ tool_name: "Bash", tool_input: { command: "python manage.py status" }, tool_result: "Pending in llm-token-tracker: dashboard update\nWritten TODO to email-manager/TODO.md" });
ok("detects pending project", stderrOutput.indexOf("llm-token-tracker") >= 0);
ok("detects TODO write target", stderrOutput.indexOf("email-manager") >= 0);
restore();

console.log("\n--- Heartbeat command ---");
setDispatcherCwd();
captureStderr();
r = mod({ tool_name: "Bash", tool_input: { command: "python manage.py heartbeat-check --json" }, tool_result: '{"status":"pending","dispatched_to":"v1-helper"}' });
ok("heartbeat with dispatch detected", stderrOutput.indexOf("v1-helper") >= 0);
restore();

console.log("\n--- Empty output ---");
setDispatcherCwd();
captureStderr();
r = mod({ tool_name: "Bash", tool_input: { command: "python manage.py poll" }, tool_result: "" });
ok("empty output passes silently", r === null);
ok("no stderr for empty", stderrOutput === "");
restore();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
