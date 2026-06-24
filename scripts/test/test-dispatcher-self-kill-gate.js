"use strict";
// Test T844: dispatcher-self-kill-gate

var passed = 0, failed = 0;
function ok(label, condition) {
  if (condition) { passed++; console.log("  PASS: " + label); }
  else { failed++; console.log("  FAIL: " + label); }
}

var origCwd = process.cwd;
function setDispatcherCwd() {
  process.cwd = function() { return "/tmp/projects/request-tracker"; };
}
function setNonDispatcherCwd() {
  process.cwd = function() { return "/tmp/projects/imsva-upgrade"; };
}
function restore() {
  process.cwd = origCwd;
}

process.env.HOOK_RUNNER_TEST = "1";
var gate = require("../../modules/PreToolUse/dispatcher-self-kill-gate.js");

console.log("=== dispatcher-self-kill-gate tests ===\n");

console.log("--- Module contract ---");
ok("exports a function", typeof gate === "function");
ok("returns null in test mode", gate({ tool_name: "Bash", tool_input: { command: "manage.py cleanup --kill" } }) === null);

delete process.env.HOOK_RUNNER_TEST;
delete require.cache[require.resolve("../../modules/PreToolUse/dispatcher-self-kill-gate.js")];
gate = require("../../modules/PreToolUse/dispatcher-self-kill-gate.js");

console.log("\n--- Non-dispatcher (always pass) ---");
setNonDispatcherCwd();
ok("manage.py cleanup --kill from non-dispatcher passes", gate({ tool_name: "Bash", tool_input: { command: "python manage.py cleanup --kill" } }) === null);
ok("close-dead-tabs from non-dispatcher passes", gate({ tool_name: "Bash", tool_input: { command: "powershell close-dead-tabs.ps1" } }) === null);
restore();

console.log("\n--- Non-Bash tools (always pass) ---");
setDispatcherCwd();
ok("Read passes", gate({ tool_name: "Read", tool_input: {} }) === null);
ok("Edit passes", gate({ tool_name: "Edit", tool_input: {} }) === null);
restore();

console.log("\n--- Self-kill blocks ---");
setDispatcherCwd();
var r;

r = gate({ tool_name: "Bash", tool_input: { command: "python manage.py cleanup --kill" } });
ok("manage.py cleanup --kill blocked", r && r.decision === "block");
ok("mentions cleanup", r && r.reason.indexOf("cleanup") >= 0);

r = gate({ tool_name: "Bash", tool_input: { command: "python3 new_session.py --close-old-tab --project-dir ." } });
ok("new_session.py --close-old-tab blocked", r && r.decision === "block");

r = gate({ tool_name: "Bash", tool_input: { command: "python3 context-reset/context_reset.py --close-old-tab" } });
ok("context-reset --close-old-tab blocked", r && r.decision === "block");

r = gate({ tool_name: "Bash", tool_input: { command: "powershell ./close-dead-tabs.ps1" } });
ok("close-dead-tabs blocked", r && r.decision === "block");

r = gate({ tool_name: "Bash", tool_input: { command: "python manage.py supervise --kill" } });
ok("manage.py supervise --kill blocked", r && r.decision === "block");
restore();

console.log("\n--- Safe commands (pass from dispatcher) ---");
setDispatcherCwd();
ok("manage.py cleanup (no --kill) passes", gate({ tool_name: "Bash", tool_input: { command: "python manage.py cleanup" } }) === null);
ok("manage.py poll passes", gate({ tool_name: "Bash", tool_input: { command: "python manage.py poll" } }) === null);
ok("manage.py status passes", gate({ tool_name: "Bash", tool_input: { command: "python manage.py status" } }) === null);
ok("manage.py supervise (no --kill) passes", gate({ tool_name: "Bash", tool_input: { command: "python manage.py supervise" } }) === null);
ok("ls passes", gate({ tool_name: "Bash", tool_input: { command: "ls -la" } }) === null);
ok("new_session.py without --close-old-tab passes", gate({ tool_name: "Bash", tool_input: { command: "python3 new_session.py --project-dir /other/project" } }) === null);
restore();

console.log("\n--- Block message quality ---");
setDispatcherCwd();
r = gate({ tool_name: "Bash", tool_input: { command: "python manage.py cleanup --kill" } });
ok("has BLOCKED:", r && r.reason.indexOf("BLOCKED:") >= 0);
ok("has WHY:", r && r.reason.indexOf("WHY:") >= 0);
ok("has NEXT STEPS:", r && r.reason.indexOf("NEXT STEPS:") >= 0);
ok("has FALSE POSITIVE:", r && r.reason.indexOf("FALSE POSITIVE?") >= 0);
restore();

console.log("\n--- Edge cases ---");
setDispatcherCwd();
ok("empty command passes", gate({ tool_name: "Bash", tool_input: { command: "" } }) === null);
ok("no command passes", gate({ tool_name: "Bash", tool_input: {} }) === null);
ok("no tool_input passes", gate({ tool_name: "Bash" }) === null);
restore();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
