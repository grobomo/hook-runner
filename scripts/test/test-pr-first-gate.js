#!/usr/bin/env node
"use strict";
// T389: Tests for pr-first-gate.js PreToolUse module
var path = require("path");
var pass = 0, fail = 0;

function assert(ok, label) {
  if (ok) { pass++; console.log("OK: " + label); }
  else { fail++; console.log("FAIL: " + label); }
}

// Test 1: module loads without error
var mod;
try {
  mod = require("../../modules/PreToolUse/pr-first-gate.js");
  assert(typeof mod === "function", "module exports a function");
} catch (e) {
  assert(false, "module loads: " + e.message);
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(1);
}

// Test 2: has WHY and WORKFLOW comments
var fs = require("fs");
var src = fs.readFileSync(path.join(__dirname, "../../modules/PreToolUse/pr-first-gate.js"), "utf-8");
assert(/\/\/\s*WHY:/.test(src), "has WHY comment");
assert(/\/\/\s*WORKFLOW:/.test(src), "has WORKFLOW comment");

// Test 3: allows TODO.md edits (exception — needed before PR exists)
var todoEdit = mod({
  tool_name: "Edit",
  tool_input: { file_path: "/projects/hook-runner/TODO.md", old_string: "x", new_string: "y" }
});
assert(todoEdit === null || todoEdit === undefined, "allows TODO.md edits");

// Test 4: allows tasks.md edits (exception)
var tasksEdit = mod({
  tool_name: "Edit",
  tool_input: { file_path: "/projects/hook-runner/specs/foo/tasks.md", old_string: "x", new_string: "y" }
});
assert(tasksEdit === null || tasksEdit === undefined, "allows tasks.md edits");

// Test 5: allows edits on main branch (no PR needed)
// Simulate main branch by setting env
var origBranch = process.env.CLAUDE_BRANCH;
process.env.CLAUDE_BRANCH = "main";
var mainEdit = mod({
  tool_name: "Edit",
  tool_input: { file_path: "/projects/hook-runner/setup.js", old_string: "x", new_string: "y" }
});
assert(mainEdit === null || mainEdit === undefined, "allows edits on main");
process.env.CLAUDE_BRANCH = origBranch;

// Test 6: module checks for open PR (uses gh or git)
assert(/gh\s+pr|github|pull request/i.test(src), "checks for open PR");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
