#!/usr/bin/env node
"use strict";
// T572: Tests for pr-per-task-gate.js
// Blocks gh pr create if title doesn't include a task ID (T001, T002, etc.)

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "pr-per-task-gate.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function makeInput(cmd) {
  return { tool_name: "Bash", tool_input: { command: cmd } };
}

// --- Non-Bash tools pass ---

check("Non-Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "x" } }) === null);
});

// --- Non-PR Bash commands pass ---

check("Bash non-PR command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("git status")) === null);
});

check("gh issue create: passes (not PR)", function() {
  var gate = loadGate();
  assert(gate(makeInput('gh issue create --title "No task ID here"')) === null);
});

check("gh pr list: passes (not create)", function() {
  var gate = loadGate();
  assert(gate(makeInput("gh pr list")) === null);
});

check("gh pr merge: passes (not create)", function() {
  var gate = loadGate();
  assert(gate(makeInput("gh pr merge 42 --squash")) === null);
});

// --- gh pr create with task ID: passes ---

check("PR title with T001: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput('gh pr create --title "T001: Fix the thing" --body "details"')) === null);
});

check("PR title with T572: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput('gh pr create --title "T572: Add tests" --body "x"')) === null);
});

check("PR title with task ID mid-string: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput('gh pr create --title "Fix: T123 widget alignment" --body "x"')) === null);
});

check("PR title with single quotes: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("gh pr create --title 'T042: Marketplace sync' --body 'done'")) === null);
});

// --- gh pr create without task ID: blocks ---

check("PR title without task ID: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('gh pr create --title "Fix the thing" --body "details"'));
  assert(r && r.decision === "block", "should block");
  assert(r.reason.indexOf("task ID") >= 0, "should mention task ID");
});

check("PR title with only numbers (no T prefix): blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('gh pr create --title "Fix issue 42" --body "x"'));
  assert(r && r.decision === "block");
});

check("PR title empty string: passes (regex can't capture empty)", function() {
  var gate = loadGate();
  // Empty title doesn't match [^"']+ so titleMatch is null — gate passes
  assert(gate(makeInput('gh pr create --title "" --body "x"')) === null);
});

check("PR title with T but only 2 digits (T01): blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('gh pr create --title "T01: short id" --body "x"'));
  assert(r && r.decision === "block");
});

// --- Edge cases ---

check("gh pr create without --title flag: passes (no title to check)", function() {
  var gate = loadGate();
  // When no --title is provided, gh prompts interactively — gate can't check
  assert(gate(makeInput("gh pr create --body 'x'")) === null);
});

check("Empty command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("")) === null);
});

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash" }) === null);
});

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
