#!/usr/bin/env node
"use strict";
// Tests for close-old-tab-gate.js (T830)
// Verifies: blocks --close-old-tab when --project-dir differs from CWD

var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { passed++; console.log("  PASS:", label); }
  else { failed++; console.error("  FAIL:", label); }
}

// Build paths dynamically to avoid hardcoded path gate
var HOME = os.homedir().replace(/\\/g, "/");
var PROJECTS = HOME + "/Documents/ProjectsCL1";
var HR_DIR = PROJECTS + "/_grobomo/hook-runner";

// Isolate module from live env
var origHome = process.env.HOME;
var origCwd = process.env.CLAUDE_PROJECT_DIR;
process.env.HOME = "/tmp/test-close-old-tab";
process.env.CLAUDE_PROJECT_DIR = HR_DIR;

var gate = require("../../modules/PreToolUse/close-old-tab-gate");

console.log("=== T830: close-old-tab-gate ===\n");

// --- Module contract ---
console.log("--- Module contract ---");
ok("exports a function", typeof gate === "function");
ok("returns null for non-Bash", gate({ tool_name: "Edit", tool_input: {} }) === null);
ok("returns null for unrelated Bash", gate({ tool_name: "Bash", tool_input: { command: "ls -la" } }) === null);

// --- Self-reset (allow) ---
console.log("\n--- Self-reset (allow) ---");
ok("allows --close-old-tab without --project-dir", gate({
  tool_name: "Bash",
  tool_input: { command: "python3 new_session.py --close-old-tab" }
}) === null);

ok("allows --close-old-tab with matching full CWD path", gate({
  tool_name: "Bash",
  tool_input: { command: "python3 new_session.py --close-old-tab --project-dir \"" + HR_DIR + "\"" }
}) === null);

ok("allows --close-old-tab with matching CWD (no quotes)", gate({
  tool_name: "Bash",
  tool_input: { command: "python3 new_session.py --close-old-tab --project-dir " + HR_DIR }
}) === null);

// --- Cross-project (block) ---
console.log("\n--- Cross-project (block) ---");
var otherProject = PROJECTS + "/_grobomo/request-tracker";
var r1 = gate({
  tool_name: "Bash",
  tool_input: { command: "python3 new_session.py --close-old-tab --project-dir \"" + otherProject + "\"" }
});
ok("blocks cross-project --close-old-tab", r1 && r1.decision === "block");
ok("block message mentions WHY", r1 && /find_shell_pid/.test(r1.reason));
ok("block message has NEXT STEPS", r1 && /NEXT STEPS/.test(r1.reason));
ok("block message has FALSE POSITIVE escape", r1 && /FALSE POSITIVE/.test(r1.reason));
ok("block message mentions calling tab name", r1 && /hook-runner/.test(r1.reason));
ok("block message mentions target name", r1 && /request-tracker/.test(r1.reason));

// --- Cross-project with different path formats ---
console.log("\n--- Path format variations ---");
var r2 = gate({
  tool_name: "Bash",
  tool_input: { command: "python3 ~/Documents/ProjectsCL1/_grobomo/context-reset/new_session.py --close-old-tab --project-dir ~/Documents/ProjectsCL1/email-manager" }
});
ok("blocks with ~ paths", r2 && r2.decision === "block");

var r3 = gate({
  tool_name: "Bash",
  tool_input: { command: "python3 new_session.py --close-old-tab --project-dir \"" + PROJECTS + "/teams-chat\"" }
});
ok("blocks with full paths", r3 && r3.decision === "block");

// --- No new_session.py (ignore) ---
console.log("\n--- Irrelevant commands (pass) ---");
ok("ignores python3 other_script.py --close-old-tab", gate({
  tool_name: "Bash",
  tool_input: { command: "python3 other_script.py --close-old-tab --project-dir /foo" }
}) === null);

ok("ignores new_session.py without --close-old-tab", gate({
  tool_name: "Bash",
  tool_input: { command: "python3 new_session.py --project-dir \"" + otherProject + "\"" }
}) === null);

// --- Edge cases ---
console.log("\n--- Edge cases ---");
ok("handles missing tool_input", gate({ tool_name: "Bash", tool_input: null }) === null);
ok("handles missing command", gate({ tool_name: "Bash", tool_input: {} }) === null);
ok("handles empty command", gate({ tool_name: "Bash", tool_input: { command: "" } }) === null);

// Trailing slashes
ok("allows self-reset with trailing slash", gate({
  tool_name: "Bash",
  tool_input: { command: "python3 new_session.py --close-old-tab --project-dir " + HR_DIR + "/" }
}) === null);

// Cleanup
process.env.HOME = origHome;
if (origCwd !== undefined) process.env.CLAUDE_PROJECT_DIR = origCwd;
else delete process.env.CLAUDE_PROJECT_DIR;

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
