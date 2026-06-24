#!/usr/bin/env node
"use strict";
// Tests for reflection-first-gate.js — blocks work until user correction is reflected upon
var fs = require("fs");
var path = require("path");
var os = require("os");

var PASS = 0, FAIL = 0;
function pass(msg) { console.log("  PASS: " + msg); PASS++; }
function fail(msg) { console.log("  FAIL: " + msg); FAIL++; }

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rfg-test-"));
var hooksDir = path.join(tmpDir, ".claude", "hooks");
fs.mkdirSync(hooksDir, { recursive: true });

var origHome = process.env.HOME;
var origProjDir = process.env.CLAUDE_PROJECT_DIR;
process.env.HOME = tmpDir;
process.env.CLAUDE_PROJECT_DIR = tmpDir;

var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "reflection-first-gate.js");
function freshLoad() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

var corrLogPath = path.join(hooksDir, "correction-log.jsonl");
var flagPath = path.join(hooksDir, ".reflection-pending.json");

process.on("exit", function() {
  process.env.HOME = origHome;
  if (origProjDir) process.env.CLAUDE_PROJECT_DIR = origProjDir;
  else delete process.env.CLAUDE_PROJECT_DIR;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
});

console.log("=== reflection-first-gate tests ===\n");

// --- Module contract ---
console.log("--- Module contract ---");
var gate = freshLoad();
if (typeof gate === "function") pass("exports a function");
else fail("should export a function");

// --- No corrections, no flag ---
console.log("\n--- No corrections ---");
gate = freshLoad();
var r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/app.js", old_string: "a", new_string: "b" } });
if (r === null) pass("no corrections passes");
else fail("no corrections should pass");

r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/app.js" } });
if (r === null) pass("Read tool always passes");
else fail("Read should always pass");

// --- Passthrough for non-action tools ---
console.log("\n--- Non-action tools pass ---");
gate = freshLoad();
r = gate({ tool_name: "Glob", tool_input: { pattern: "*.js" } });
if (r === null) pass("Glob passes");
else fail("Glob should pass");

r = gate({ tool_name: "Grep", tool_input: { pattern: "test" } });
if (r === null) pass("Grep passes");
else fail("Grep should pass");

// --- Recent correction triggers flag ---
console.log("\n--- Recent correction blocks ---");
var corrEntry = JSON.stringify({
  ts: new Date().toISOString(),
  prompt_preview: "Stop using CLAUDE.md for rules",
  pattern: "rules-in-claudemd"
});
fs.writeFileSync(corrLogPath, corrEntry + "\n");

gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "echo hi" } });
if (r && r.decision === "block") pass("recent correction blocks Bash");
else fail("recent correction should block Bash");

if (r && r.reason.indexOf("correction") !== -1) pass("block mentions correction");
else fail("block should mention correction");

// --- Flag persists for second call ---
console.log("\n--- Flag persists ---");
gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: { file_path: "/tmp/new.js", content: "x" } });
if (r && r.decision === "block") pass("flag still blocks on second call");
else fail("flag should persist and block");

// --- TODO.md edit is allowed ---
console.log("\n--- TODO.md allowed (reflection target) ---");
gate = freshLoad();
r = gate({ tool_name: "Edit", tool_input: {
  file_path: path.join(tmpDir, "TODO.md"),
  old_string: "old",
  new_string: "new"
} });
if (r === null) pass("Edit to TODO.md allowed");
else fail("TODO.md edit should be allowed during reflection");

// --- TODO.md with reflection keywords clears flag ---
console.log("\n--- Reflection clears flag ---");
// Re-create the flag
fs.writeFileSync(flagPath, JSON.stringify({
  ts: new Date().toISOString(),
  correction_preview: "test",
  pattern: "test-pattern",
  reflected: false
}));

gate = freshLoad();
r = gate({ tool_name: "Edit", tool_input: {
  file_path: path.join(tmpDir, "TODO.md"),
  old_string: "section",
  new_string: "Root cause: used wrong approach. Lesson: always check first."
} });
if (r === null) pass("reflection edit to TODO.md allowed");
else fail("reflection edit should be allowed");

// Check flag was cleared
var flagData = JSON.parse(fs.readFileSync(flagPath, "utf-8"));
if (flagData.reflected === true) pass("flag marked as reflected");
else fail("flag should be marked as reflected");

// Clear correction log so flag doesn't re-trigger from old corrections
try { fs.unlinkSync(corrLogPath); } catch(e) {}

// Next action tool should pass (flag reflected=true, no correction log)
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "echo hi" } });
if (r === null) pass("Bash passes after reflection");
else fail("should pass after reflection completed");

// --- Expired flag is ignored ---
console.log("\n--- Expired flag ignored ---");
fs.writeFileSync(flagPath, JSON.stringify({
  ts: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
  correction_preview: "old",
  pattern: "old",
  reflected: false
}));
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "echo hi" } });
if (r === null) pass("expired flag passes");
else fail("expired flag (>30min) should pass");

// --- Block message format ---
console.log("\n--- Block message format ---");
fs.writeFileSync(flagPath, JSON.stringify({
  ts: new Date().toISOString(),
  correction_preview: "test correction",
  pattern: "",
  reflected: false
}));
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "ls" } });
if (r && r.reason.indexOf("BLOCKED:") !== -1) pass("has BLOCKED:");
else fail("should have BLOCKED:");
if (r && r.reason.indexOf("FALSE POSITIVE") !== -1) pass("has FALSE POSITIVE escape");
else fail("should have FALSE POSITIVE escape");

// Cleanup
try { fs.unlinkSync(corrLogPath); } catch(e) {}
try { fs.unlinkSync(flagPath); } catch(e) {}

console.log("\n=== Results: " + PASS + " passed, " + FAIL + " failed ===");
process.exit(FAIL > 0 ? 1 : 0);
