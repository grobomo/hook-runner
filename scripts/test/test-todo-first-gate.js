#!/usr/bin/env node
"use strict";
// Tests for todo-first-gate.js (T802)
// Verifies: blocks state-changing tools when pending requests aren't in TODO.md

var fs = require("fs");
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { passed++; console.log("  PASS:", label); }
  else { failed++; console.error("  FAIL:", label); }
}

// Set up isolated test env
var tmpDir = path.join(os.tmpdir(), "test-todo-first-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
var hooksDir = path.join(tmpDir, ".claude", "hooks");
fs.mkdirSync(hooksDir, { recursive: true });

var origHome = process.env.HOME;
var origUserProfile = process.env.USERPROFILE;
var origSession = process.env.CLAUDE_SESSION_ID;
var origProject = process.env.CLAUDE_PROJECT_DIR;

process.env.HOME = tmpDir;
process.env.USERPROFILE = tmpDir;
process.env.CLAUDE_SESSION_ID = "test1234-abcd";
process.env.CLAUDE_PROJECT_DIR = tmpDir;

// Write a pending requests file
var pendingFile = path.join(hooksDir, ".pending-requests-test1234.json");
function writePending(requests) {
  fs.writeFileSync(pendingFile, JSON.stringify({
    requests: requests,
    ts: new Date().toISOString(),
    prompt_preview: "test prompt"
  }));
}
function clearPending() {
  try { fs.unlinkSync(pendingFile); } catch (e) {}
}

// Write TODO.md
var todoPath = path.join(tmpDir, "TODO.md");
function writeTodo(content) {
  fs.writeFileSync(todoPath, content);
}
function clearTodo() {
  try { fs.unlinkSync(todoPath); } catch (e) {}
}

var gate = require("../../modules/PreToolUse/todo-first-gate");

console.log("=== T802: todo-first-gate ===\n");

// --- Module contract ---
console.log("--- Module contract ---");
ok("exports a function", typeof gate === "function");

// --- No pending requests (pass everything) ---
console.log("\n--- No pending requests ---");
clearPending();
ok("passes Edit when no pending file", gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/src/app.js" }
}) === null);

ok("passes Bash when no pending file", gate({
  tool_name: "Bash",
  tool_input: { command: "echo hello" }
}) === null);

// --- Pending requests, no TODO.md edits yet (block) ---
console.log("\n--- Pending requests blocking ---");
writePending(["fix the login bug", "add user authentication"]);

var r1 = gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/src/app.js" }
});
ok("blocks Edit to non-TODO file", r1 && r1.decision === "block");
ok("block message lists requests", r1 && /login bug/.test(r1.reason));
ok("block message has NEXT STEPS", r1 && /NEXT STEPS/.test(r1.reason));
ok("block message has FALSE POSITIVE escape", r1 && /FALSE POSITIVE/.test(r1.reason));

var r2 = gate({
  tool_name: "Write",
  tool_input: { file_path: tmpDir + "/src/new-file.js" }
});
ok("blocks Write to non-TODO file", r2 && r2.decision === "block");

var r3 = gate({
  tool_name: "Bash",
  tool_input: { command: "npm install express" }
});
ok("blocks Bash (state-changing)", r3 && r3.decision === "block");

// --- Allow TODO.md edits ---
console.log("\n--- TODO.md edits allowed ---");
ok("allows Edit to TODO.md", gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/TODO.md" }
}) === null);

ok("allows Write to TODO.md", gate({
  tool_name: "Write",
  tool_input: { file_path: tmpDir + "/TODO.md" }
}) === null);

// Case insensitive
ok("allows Edit to todo.md (lowercase)", gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/todo.md" }
}) === null);

// --- Read-only tools always pass ---
console.log("\n--- Read-only tools ---");
var readOnlyTools = ["Read", "Glob", "Grep", "WebSearch", "WebFetch", "TaskCreate", "TaskUpdate"];
readOnlyTools.forEach(function(t) {
  ok("passes " + t + " with pending requests", gate({
    tool_name: t,
    tool_input: {}
  }) === null);
});

// --- Bash read-only commands pass ---
console.log("\n--- Bash read-only commands ---");
ok("passes grep command", gate({
  tool_name: "Bash",
  tool_input: { command: "grep -r TODO ." }
}) === null);

ok("passes git status", gate({
  tool_name: "Bash",
  tool_input: { command: "git status" }
}) === null);

ok("passes git log", gate({
  tool_name: "Bash",
  tool_input: { command: "git log --oneline -5" }
}) === null);

// --- Requests tracked in TODO.md clears lock ---
console.log("\n--- Auto-clear when tracked ---");
writePending(["fix the login bug", "add user authentication"]);
writeTodo("# TODO\n- [ ] T999: Fix the login bug in auth module\n- [ ] T1000: Add user authentication system\n");

var r4 = gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/src/app.js" }
});
ok("passes when all requests tracked in TODO.md", r4 === null);
ok("pending file removed after auto-clear", !fs.existsSync(pendingFile));

// --- Partial tracking still blocks ---
console.log("\n--- Partial tracking ---");
writePending(["fix the login bug", "add email notifications"]);
writeTodo("# TODO\n- [ ] T999: Fix the login bug\n");

var r5 = gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/src/app.js" }
});
ok("blocks when only some requests tracked", r5 && r5.decision === "block");

// --- Expired pending (>30 min) passes ---
console.log("\n--- Expiry ---");
var expired = new Date(Date.now() - 31 * 60 * 1000).toISOString();
fs.writeFileSync(pendingFile, JSON.stringify({
  requests: ["old request"],
  ts: expired,
  prompt_preview: "old"
}));
ok("passes with expired pending requests", gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/src/app.js" }
}) === null);

// --- Empty requests array passes ---
console.log("\n--- Edge cases ---");
fs.writeFileSync(pendingFile, JSON.stringify({ requests: [], ts: new Date().toISOString() }));
ok("passes with empty requests array", gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/src/app.js" }
}) === null);

// Malformed JSON
fs.writeFileSync(pendingFile, "not json");
ok("passes with malformed pending file", gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/src/app.js" }
}) === null);

// Cleanup
process.env.HOME = origHome;
if (origUserProfile !== undefined) process.env.USERPROFILE = origUserProfile;
else delete process.env.USERPROFILE;
if (origSession !== undefined) process.env.CLAUDE_SESSION_ID = origSession;
else delete process.env.CLAUDE_SESSION_ID;
if (origProject !== undefined) process.env.CLAUDE_PROJECT_DIR = origProject;
else delete process.env.CLAUDE_PROJECT_DIR;
clearPending();
clearTodo();
try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
