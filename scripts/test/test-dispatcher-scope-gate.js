"use strict";
// Test T841: dispatcher-scope-gate

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

// Load module in test mode
process.env.HOOK_RUNNER_TEST = "1";
var gate = require("../../modules/PreToolUse/dispatcher-scope-gate.js");

console.log("=== dispatcher-scope-gate tests ===\n");

console.log("--- Module contract ---");
ok("exports a function", typeof gate === "function");
ok("returns null in test mode", gate({ tool_name: "Edit", tool_input: { file_path: "/other/file.js" } }) === null);

// Remove test mode
delete process.env.HOOK_RUNNER_TEST;
delete require.cache[require.resolve("../../modules/PreToolUse/dispatcher-scope-gate.js")];
gate = require("../../modules/PreToolUse/dispatcher-scope-gate.js");

console.log("\n--- Non-dispatcher project (always pass) ---");
setNonDispatcherCwd();
ok("Edit from non-dispatcher passes", gate({ tool_name: "Edit", tool_input: { file_path: "/other/project/file.js" } }) === null);
ok("Write from non-dispatcher passes", gate({ tool_name: "Write", tool_input: { file_path: "/other/project/file.js" } }) === null);
restore();

console.log("\n--- Non-Edit/Write tools (always pass) ---");
setDispatcherCwd();
ok("Bash passes", gate({ tool_name: "Bash", tool_input: {} }) === null);
ok("Read passes", gate({ tool_name: "Read", tool_input: {} }) === null);
ok("Grep passes", gate({ tool_name: "Grep", tool_input: {} }) === null);
ok("Glob passes", gate({ tool_name: "Glob", tool_input: {} }) === null);
restore();

console.log("\n--- Own project files (pass) ---");
setDispatcherCwd();
var r;
ok("Edit own project passes", gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/projects/request-tracker/server.py" } }) === null);
ok("Write own project passes", gate({ tool_name: "Write", tool_input: { file_path: "/tmp/projects/request-tracker/manage.py" } }) === null);
ok("Edit own project (Windows path)", gate({ tool_name: "Edit", tool_input: { file_path: "C:\\Users\\user\\request-tracker\\server.py" } }) === null);
restore();

console.log("\n--- Cross-project blocks ---");
setDispatcherCwd();
r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/projects/llm-token-tracker/dashboard/index.html" } });
ok("Edit other project blocked", r && r.decision === "block");

r = gate({ tool_name: "Write", tool_input: { file_path: "/tmp/projects/imsva-upgrade/CHECKLIST.md" } });
ok("Write other project blocked", r && r.decision === "block");

r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/projects/hook-runner/modules/test.js" } });
ok("Edit hook-runner module blocked", r && r.decision === "block");
restore();

console.log("\n--- Allowed cross-project patterns ---");
setDispatcherCwd();
ok("TODO.md allowed", gate({ tool_name: "Write", tool_input: { file_path: "/tmp/projects/hook-runner/TODO.md" } }) === null);
ok("todo.md case-insensitive", gate({ tool_name: "Write", tool_input: { file_path: "/tmp/projects/other/todo.md" } }) === null);
ok(".coconut/ allowed", gate({ tool_name: "Write", tool_input: { file_path: "/tmp/projects/hook-runner/.coconut/STATUS_REPORT.md" } }) === null);
ok(".claude/plans/ allowed", gate({ tool_name: "Write", tool_input: { file_path: "/tmp/projects/other/.claude/plans/plan.md" } }) === null);
ok("SESSION_STATE.md allowed", gate({ tool_name: "Write", tool_input: { file_path: "/tmp/projects/other/SESSION_STATE.md" } }) === null);
restore();

console.log("\n--- Block message quality ---");
setDispatcherCwd();
r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/projects/other/src/main.js" } });
ok("has BLOCKED:", r && r.reason.indexOf("BLOCKED:") >= 0);
ok("has WHY:", r && r.reason.indexOf("WHY:") >= 0);
ok("has NEXT STEPS:", r && r.reason.indexOf("NEXT STEPS:") >= 0);
ok("has FALSE POSITIVE:", r && r.reason.indexOf("FALSE POSITIVE?") >= 0);
restore();

console.log("\n--- Edge cases ---");
setDispatcherCwd();
ok("empty file_path passes", gate({ tool_name: "Edit", tool_input: { file_path: "" } }) === null);
ok("no file_path passes", gate({ tool_name: "Edit", tool_input: {} }) === null);
ok("no tool_input passes", gate({ tool_name: "Edit" }) === null);
restore();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
