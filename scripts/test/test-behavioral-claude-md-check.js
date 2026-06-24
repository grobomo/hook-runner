#!/usr/bin/env node
"use strict";
// Tests for behavioral-claude-md-check.js — detect behavioral rules in CLAUDE.md
var path = require("path");

var PASS = 0, FAIL = 0;
function pass(msg) { console.log("  PASS: " + msg); PASS++; }
function fail(msg) { console.log("  FAIL: " + msg); FAIL++; }

var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "behavioral-claude-md-check.js");
function freshLoad() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function testEdit(filePath, newString) {
  var gate = freshLoad();
  return gate({ tool_name: "Edit", tool_input: { file_path: filePath, new_string: newString } });
}

function testWrite(filePath, content) {
  var gate = freshLoad();
  return gate({ tool_name: "Write", tool_input: { file_path: filePath, content: content } });
}

console.log("=== behavioral-claude-md-check tests ===\n");

// --- Non-CLAUDE.md files skip ---
console.log("--- Non-CLAUDE.md files ---");
var r = testEdit("/project/README.md", "Always check before deploying code changes to production");
if (r === null) pass("README.md skipped");
else fail("Non-CLAUDE.md should skip");

r = testEdit("/project/TODO.md", "Must always verify tests before marking done");
if (r === null) pass("TODO.md skipped");
else fail("Non-CLAUDE.md should skip");

// --- Non-Edit/Write tools skip ---
console.log("\n--- Non-Edit/Write tools ---");
var gate = freshLoad();
r = gate({ tool_name: "Read", tool_input: { file_path: "/project/CLAUDE.md" } });
if (r === null) pass("Read tool skipped");
else fail("Read should skip");

// --- Behavioral patterns detected ---
console.log("\n--- Behavioral patterns (should warn) ---");
r = testEdit("/project/CLAUDE.md", "Always check test output before declaring a task complete");
if (r && r.decision === "block") pass("'Always check' detected");
else fail("Should detect 'always check' pattern");

r = testEdit("/project/CLAUDE.md", "Never skip running the test suite after code changes");
if (r && r.decision === "block") pass("'Never skip' detected");
else fail("Should detect 'never skip' pattern");

r = testEdit("/project/CLAUDE.md", "You must always run tests before committing any changes");
if (r && r.decision === "block") pass("'Must always' detected");
else fail("Should detect 'must always' pattern");

r = testEdit("/project/CLAUDE.md", "Before every commit, verify that all tests pass and review output");
if (r && r.decision === "block") pass("'Before every commit' detected");
else fail("Should detect 'before every' pattern");

r = testEdit("/project/CLAUDE.md", "After each deploy, run the health check and verify uptime");
if (r && r.decision === "block") pass("'After each deploy' detected");
else fail("Should detect 'after each' pattern");

r = testEdit("/project/CLAUDE.md", "Do not ever proceed without running the full test suite first");
if (r && r.decision === "block") pass("'Do not ever proceed' detected");
else fail("Should detect 'do not ever proceed' pattern");

r = testWrite("/project/CLAUDE.md", "Mandatory step: review all changed files before pushing to remote");
if (r && r.decision === "block") pass("'Mandatory step' via Write detected");
else fail("Should detect 'mandatory step' in Write");

// --- Design principles (should allow) ---
console.log("\n--- Design principles (should allow) ---");
r = testEdit("/project/CLAUDE.md", "The architecture uses a modular design approach with simple, portable components");
if (r === null) pass("Design principle allowed");
else fail("Design principles should be allowed: " + JSON.stringify(r));

r = testEdit("/project/CLAUDE.md", "Prefer cross-platform design patterns over OS-specific approaches");
if (r === null) pass("Cross-platform principle allowed");
else fail("Design principles should be allowed");

// --- Short content skipped ---
console.log("\n--- Short content ---");
r = testEdit("/project/CLAUDE.md", "short text");
if (r === null) pass("Short content skipped");
else fail("Content under 20 chars should skip");

// --- Warning message format ---
console.log("\n--- Warning message format ---");
r = testEdit("/project/CLAUDE.md", "Always verify output before declaring done. Never skip this step.");
if (r && r.reason.indexOf("BEHAVIORAL") !== -1) pass("Message mentions BEHAVIORAL");
else fail("Should mention BEHAVIORAL");
if (r && r.reason.indexOf("gate") !== -1) pass("Message mentions gate conversion");
else fail("Should suggest gate conversion");
if (r && r.reason.indexOf("FALSE POSITIVE") !== -1) pass("Message has FALSE POSITIVE escape");
else fail("Should have FALSE POSITIVE line");

// --- Mixed content: more principles than behavioral ---
console.log("\n--- Mixed content (principle-heavy) ---");
r = testEdit("/project/CLAUDE.md",
  "The architecture uses modular design principles for portable, cross-platform " +
  "simple security patterns. Always check the philosophy of the approach."
);
if (r === null) pass("Principle-heavy mixed content allowed");
else fail("More principles than behavioral should allow");

console.log("\n=== Results: " + PASS + " passed, " + FAIL + " failed ===");
process.exit(FAIL > 0 ? 1 : 0);
