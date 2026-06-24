#!/usr/bin/env node
"use strict";
// Tests for no-native-memory-gate.js — blocks writes to .claude/rules/ and MEMORY.md
var path = require("path");
var os = require("os");

var PASS = 0, FAIL = 0;
function pass(msg) { console.log("  PASS: " + msg); PASS++; }
function fail(msg) { console.log("  FAIL: " + msg); FAIL++; }

var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "no-native-memory-gate.js");
function freshLoad() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

var home = os.homedir().replace(/\\/g, "/");

console.log("=== no-native-memory-gate tests ===\n");

// --- Module contract ---
console.log("--- Module contract ---");
var gate = freshLoad();
if (typeof gate === "function") pass("exports a function");
else fail("should export a function");

// --- Passthrough ---
console.log("\n--- Passthrough ---");
gate = freshLoad();
var r = gate({ tool_name: "Read", tool_input: { file_path: home + "/.claude/rules/foo.md" } });
if (r === null) pass("Read tool passes");
else fail("Read should always pass");

r = gate({ tool_name: "Write", tool_input: { file_path: "/tmp/app.js", content: "x" } });
if (r === null) pass("Write to non-rules path passes");
else fail("non-rules Write should pass");

r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/CLAUDE.md", old_string: "a", new_string: "b" } });
if (r === null) pass("Edit to non-rules path passes");
else fail("non-rules Edit should pass");

r = gate({ tool_name: "Bash", tool_input: { command: "echo hello" } });
if (r === null) pass("Bash not targeting rules passes");
else fail("non-rules Bash should pass");

// --- Block: .claude/rules/ ---
console.log("\n--- Block: .claude/rules/ ---");
gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/rules/my-rule.md", content: "rule text" } });
if (r && r.decision === "block") pass("Write to global .claude/rules/ blocked");
else fail("Write to .claude/rules/ should block");

r = gate({ tool_name: "Edit", tool_input: { file_path: home + "/.claude/rules/existing.md", old_string: "a", new_string: "b" } });
if (r && r.decision === "block") pass("Edit to global .claude/rules/ blocked");
else fail("Edit to .claude/rules/ should block");

r = gate({ tool_name: "Write", tool_input: { file_path: "/projects/myapp/.claude/rules/local.md", content: "x" } });
if (r && r.decision === "block") pass("Write to project .claude/rules/ blocked");
else fail("Write to project .claude/rules/ should block");

// --- Block: MEMORY.md ---
console.log("\n--- Block: MEMORY.md ---");
gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: { file_path: home + "/MEMORY.md", content: "memory" } });
if (r && r.decision === "block") pass("Write to MEMORY.md blocked");
else fail("Write to MEMORY.md should block");

r = gate({ tool_name: "Edit", tool_input: { file_path: "/projects/app/MEMORY.md", old_string: "x", new_string: "y" } });
if (r && r.decision === "block") pass("Edit to MEMORY.md blocked");
else fail("Edit to MEMORY.md should block");

// --- Block: .claude/memory/ ---
console.log("\n--- Block: .claude/memory/ ---");
gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/memory/auto.json", content: "{}" } });
if (r && r.decision === "block") pass("Write to .claude/memory/ blocked");
else fail("Write to .claude/memory/ should block");

// --- Block: Bash mutations ---
console.log("\n--- Block: Bash mutations ---");
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "echo 'rule' > " + home + "/.claude/rules/new.md" } });
if (r && r.decision === "block") pass("Bash redirect to .claude/rules/ blocked");
else fail("Bash redirect to .claude/rules/ should block");

// --- Block message format ---
console.log("\n--- Block message format ---");
gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/rules/test.md", content: "x" } });
if (r && r.reason.indexOf("BLOCKED:") !== -1) pass("has BLOCKED:");
else fail("should have BLOCKED:");
if (r && r.reason.indexOf("WHY:") !== -1) pass("has WHY:");
else fail("should have WHY:");
if (r && r.reason.indexOf("NEXT STEPS:") !== -1) pass("has NEXT STEPS:");
else fail("should have NEXT STEPS:");
if (r && r.reason.indexOf("FALSE POSITIVE") !== -1) pass("has FALSE POSITIVE escape");
else fail("should have FALSE POSITIVE escape");

console.log("\n=== Results: " + PASS + " passed, " + FAIL + " failed ===");
process.exit(FAIL > 0 ? 1 : 0);
