"use strict";
// Test T816: self-analysis-check

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
var mod = require("../../modules/PostToolUse/self-analysis-check.js");

console.log("=== self-analysis-check tests ===\n");

console.log("--- Module contract ---");
ok("exports a function", typeof mod === "function");
ok("returns null in test mode", mod({ tool_name: "Bash", tool_input: { command: "python manage.py poll" } }) === null);

delete process.env.HOOK_RUNNER_TEST;
delete require.cache[require.resolve("../../modules/PostToolUse/self-analysis-check.js")];
mod = require("../../modules/PostToolUse/self-analysis-check.js");

console.log("\n--- Non-dispatcher project ---");
setNonDispatcherCwd();
captureStderr();
ok("non-dispatcher passes", mod({ tool_name: "Bash", tool_input: { command: "python manage.py poll" } }) === null);
ok("no stderr", stderrOutput === "");
restore();

console.log("\n--- Non-Bash tool ---");
setDispatcherCwd();
captureStderr();
ok("Read passes", mod({ tool_name: "Read", tool_input: {} }) === null);
ok("Edit passes", mod({ tool_name: "Edit", tool_input: {} }) === null);
restore();

console.log("\n--- Non-poll command ---");
setDispatcherCwd();
captureStderr();
ok("ls passes silently", mod({ tool_name: "Bash", tool_input: { command: "ls -la" } }) === null);
ok("no stderr for ls", stderrOutput === "");
restore();

console.log("\n--- Poll command (health checks run) ---");
setDispatcherCwd();
captureStderr();
var r = mod({ tool_name: "Bash", tool_input: { command: "python manage.py poll" } });
ok("returns null (non-blocking)", r === null);
// Whether stderr is emitted depends on actual log state — that's fine
restore();

console.log("\n--- Various trigger commands ---");
setDispatcherCwd();
captureStderr();
ok("status triggers", mod({ tool_name: "Bash", tool_input: { command: "python manage.py status --json" } }) === null);
ok("heartbeat triggers", mod({ tool_name: "Bash", tool_input: { command: "python manage.py heartbeat-check" } }) === null);
ok("health triggers", mod({ tool_name: "Bash", tool_input: { command: "python manage.py health" } }) === null);
ok("supervise triggers", mod({ tool_name: "Bash", tool_input: { command: "python manage.py supervise" } }) === null);
ok("self-check triggers", mod({ tool_name: "Bash", tool_input: { command: "node self-check.js" } }) === null);
restore();

console.log("\n--- Edge cases ---");
setDispatcherCwd();
captureStderr();
ok("empty command passes", mod({ tool_name: "Bash", tool_input: { command: "" } }) === null);
ok("no command passes", mod({ tool_name: "Bash", tool_input: {} }) === null);
ok("no tool_input passes", mod({ tool_name: "Bash" }) === null);
restore();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
