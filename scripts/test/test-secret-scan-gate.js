#!/usr/bin/env node
"use strict";
// Tests for secret-scan-gate.js
// Note: this module calls git diff --cached internally, so we can only unit-test
// the input filtering (non-git-commit → null) and pattern matching on actual diffs
// requires a real git repo. We test what we can.
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/secret-scan-gate.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

// --- Tool filtering ---
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Edit tool ignored", gate({tool_name: "Edit", tool_input: {}}) === null);
ok("Write tool ignored", gate({tool_name: "Write", tool_input: {}}) === null);

// --- Non-git-commit Bash commands pass ---
ok("echo passes", gate({tool_name: "Bash", tool_input: {command: "echo hello"}}) === null);
ok("git status passes", gate({tool_name: "Bash", tool_input: {command: "git status"}}) === null);
ok("git push passes", gate({tool_name: "Bash", tool_input: {command: "git push origin main"}}) === null);
ok("git diff passes", gate({tool_name: "Bash", tool_input: {command: "git diff --cached"}}) === null);
ok("git add passes", gate({tool_name: "Bash", tool_input: {command: "git add -A"}}) === null);
ok("npm install passes", gate({tool_name: "Bash", tool_input: {command: "npm install express"}}) === null);

// --- git commit triggers scan (but may pass/fail based on actual staged files) ---
// In a test context, git diff --cached will either return nothing (no staged files)
// or fail (not in a git repo). Either way the module returns null gracefully.
ok("git commit graceful", gate({tool_name: "Bash", tool_input: {command: "git commit -m 'test'"}}) === null);
ok("chained git commit graceful", gate({tool_name: "Bash", tool_input: {command: "git add . && git commit -m 'fix'"}}) === null);

// --- Empty/missing command ---
ok("empty command passes", gate({tool_name: "Bash", tool_input: {command: ""}}) === null);
ok("no command passes", gate({tool_name: "Bash", tool_input: {}}) === null);

// --- String tool_input ---
ok("string tool_input no crash", gate({tool_name: "Bash", tool_input: JSON.stringify({command: "git commit -m 'x'"})}) === null);

// --- Verify SECRET_PATTERNS exist by checking module doesn't crash ---
// These test the regex patterns are valid (no syntax errors)
ok("module loaded without errors", typeof gate === "function");

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
