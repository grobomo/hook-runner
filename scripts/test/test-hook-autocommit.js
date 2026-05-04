#!/usr/bin/env node
"use strict";
// Tests for modules/PostToolUse/hook-autocommit.js
// hook-autocommit auto-commits changes to run-modules when Write/Edit tools modify
// files in the run-modules directory. Uses child_process.execFileSync("git"...).

var path = require("path");
var os = require("os");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "PostToolUse", "hook-autocommit.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);
var HOME = os.homedir().replace(/\\/g, "/");

assert("Is a function", typeof mod === "function");

// --- Non-Write/Edit tools should pass ---
assert("Non-Write tool: passes", mod({ tool_name: "Read", tool_input: {} }) === null);
assert("Non-Edit tool: passes", mod({ tool_name: "Bash", tool_input: {} }) === null);
assert("Glob tool: passes", mod({ tool_name: "Glob", tool_input: {} }) === null);

// --- Write/Edit to non-module paths should pass ---
assert("Write to non-module path: passes", mod({
  tool_name: "Write",
  tool_input: { file_path: path.join(HOME, "project", "src", "index.js") }
}) === null);

assert("Edit to non-module path: passes", mod({
  tool_name: "Edit",
  tool_input: { file_path: path.join(HOME, "project", "main.py") }
}) === null);

// --- Write/Edit to run-modules paths ---
// These will try to run git but fail (not a git repo at MODULES_DIR in test).
// The module catches the error silently and returns null.
assert("Write to run-modules path: returns null (git error caught)", mod({
  tool_name: "Write",
  tool_input: { file_path: path.join(HOME, ".claude", "hooks", "run-modules", "PreToolUse", "test.js") }
}) === null);

assert("Edit to run-modules path: returns null (git error caught)", mod({
  tool_name: "Edit",
  tool_input: { file_path: path.join(HOME, ".claude", "hooks", "run-modules", "Stop", "check.js") }
}) === null);

// --- Edge cases ---
assert("Empty input: passes", mod({}) === null);
assert("Missing tool_input: passes", mod({ tool_name: "Write" }) === null);
assert("Missing file_path: passes", mod({ tool_name: "Edit", tool_input: {} }) === null);

// --- Windows path with backslashes ---
var winPath = HOME.replace(/\//g, "\\") + "\\.claude\\hooks\\run-modules\\PreToolUse\\gate.js";
assert("Windows backslash path to run-modules: returns null", mod({
  tool_name: "Write",
  tool_input: { file_path: winPath }
}) === null);

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
