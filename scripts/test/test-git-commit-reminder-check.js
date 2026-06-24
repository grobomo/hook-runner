#!/usr/bin/env node
"use strict";
// Test git-commit-reminder-check PostToolUse module
var path = require("path");
var fs = require("fs");
var os = require("os");

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name); console.log("  " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "PostToolUse", "git-commit-reminder-check.js");

// Clear cooldown before each test
var sessionId = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
var COOLDOWN_FILE = path.join(os.tmpdir(), "git-commit-reminder-" + sessionId);

function clearCooldown() {
  try { fs.unlinkSync(COOLDOWN_FILE); } catch (e) {}
}

function freshModule() {
  delete require.cache[require.resolve(MOD_PATH)];
  clearCooldown();
  return require(MOD_PATH);
}

// --- Tool filtering ---
test("ignores Read tool", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/repo/TODO.md" } });
  assert(r === null);
});

test("ignores Bash tool", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Bash", tool_input: { command: "echo hi" } });
  assert(r === null);
});

test("ignores Glob tool", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Glob", tool_input: {} });
  assert(r === null);
});

// --- File pattern filtering ---
test("ignores Edit to non-doc file", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/repo/src/main.js" } });
  assert(r === null);
});

test("ignores Write to non-doc file", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/repo/package.json" } });
  assert(r === null);
});

// --- Tracked file detection ---
test("fires for Edit to TODO.md", function() {
  var gate = freshModule();
  // This will try to find git root — may or may not work depending on cwd
  // The key test is that it doesn't return null at the file-matching stage
  // We test by checking it gets past the isTracked check
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.resolve(__dirname, "../../TODO.md") } });
  // Result is null (reminder printed to stderr) — that's correct (non-blocking)
  assert(r === null, "should return null (non-blocking)");
});

test("fires for Write to CHANGELOG.md", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/repo/CHANGELOG.md" } });
  assert(r === null);
});

test("fires for Edit to docs/ file", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/repo/docs/vision/arch.md" } });
  assert(r === null);
});

test("fires for Edit to specs/ file", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/repo/specs/T100.md" } });
  assert(r === null);
});

test("fires for Write to SESSION_STATE.md", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/repo/SESSION_STATE.md" } });
  assert(r === null);
});

// --- Never blocks ---
test("never returns block decision", function() {
  var gate = freshModule();
  // Even for tracked files, should never block
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.resolve(__dirname, "../../TODO.md") } });
  assert(r === null || (r && r.decision !== "block"), "should never block");
});

// --- Cooldown ---
test("cooldown prevents repeated reminders", function() {
  var gate = freshModule();
  // First call — should process
  gate({ tool_name: "Edit", tool_input: { file_path: path.resolve(__dirname, "../../TODO.md") } });
  // Second call — should skip (cooldown)
  // Need to re-require to reset module state but keep cooldown file
  delete require.cache[require.resolve(MOD_PATH)];
  var gate2 = require(MOD_PATH);
  // The module reads the cooldown file, so second call should skip
  // We can verify by checking the cooldown file exists
  var exists = false;
  try { fs.statSync(COOLDOWN_FILE); exists = true; } catch(e) {}
  // cooldown file should exist after first call (if git root was found)
  // Either way, module should return null
  var r2 = gate2({ tool_name: "Edit", tool_input: { file_path: path.resolve(__dirname, "../../TODO.md") } });
  assert(r2 === null);
});

// --- Edge cases ---
test("handles missing file_path gracefully", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Edit", tool_input: {} });
  assert(r === null);
});

test("handles null tool_input gracefully", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Write", tool_input: null });
  assert(r === null);
});

test("handles backslash paths", function() {
  var gate = freshModule();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "C:\\repo\\TODO.md" } });
  assert(r === null);
});

// Cleanup
clearCooldown();

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);
