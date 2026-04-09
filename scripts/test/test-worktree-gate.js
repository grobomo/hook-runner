#!/usr/bin/env node
"use strict";
// T382: Tests for worktree-gate.js — enforce worktree usage for feature branches
var fs = require("fs");
var path = require("path");
var os = require("os");

var pass = 0, fail = 0;
function assert(ok, label) {
  if (ok) { pass++; console.log("OK: " + label); }
  else { fail++; console.log("FAIL: " + label); }
}

var modPath = path.join(__dirname, "../../modules/PreToolUse/worktree-gate.js");
assert(fs.existsSync(modPath), "module file exists");

var mod = require(modPath);
assert(typeof mod === "function", "module exports a function");

var src = fs.readFileSync(modPath, "utf-8");
assert(/\/\/\s*WHY:/.test(src), "has WHY comment");
assert(/\/\/\s*WORKFLOW:/.test(src), "has WORKFLOW comment");

// Setup: temp dir simulating a main checkout with specs/
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wt-gate-"));
var specsDir = path.join(tmpDir, "specs");
fs.mkdirSync(specsDir);
var gitDir = path.join(tmpDir, ".git");
fs.mkdirSync(gitDir);
// Write a HEAD file pointing to a feature branch
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/258-T382-lesson-effectiveness\n");

// Test: feature branch in main checkout with specs/ → block
var r = mod({
  tool_name: "Edit",
  tool_input: {file_path: path.join(tmpDir, "foo.js")},
  _git: {branch: "258-T382-lesson-effectiveness"}
});
// Set CLAUDE_PROJECT_DIR to tmpDir for detection
var origDir = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = tmpDir;
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r && r.decision === "block", "feature branch in main checkout blocks");
assert(r && r.reason && r.reason.indexOf("worktree") >= 0, "block message mentions worktree");

// Test: main branch → pass
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "main branch passes");

// Test: worktree (.git is a file, not dir) → pass
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/258-T382-lesson-effectiveness\n");
// Simulate worktree: replace .git dir with .git file
fs.rmSync(gitDir, {recursive: true});
fs.writeFileSync(gitDir, "gitdir: /some/main/repo/.git/worktrees/258-T382\n");
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "worktree (.git is file) passes");

// Test: Read tool → pass (not gated)
fs.unlinkSync(gitDir);
fs.mkdirSync(gitDir);
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/feat/something\n");
r = mod({tool_name: "Read", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "Read tool not gated");

// Test: Bash tool → pass (not gated)
r = mod({tool_name: "Bash", tool_input: {command: "echo hi"}});
assert(r === null || r === undefined, "Bash tool not gated");

// Test: no specs/ dir → pass
fs.rmSync(specsDir, {recursive: true});
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/feat/something\n");
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "no specs dir passes (not SHTD repo)");

// Restore
process.env.CLAUDE_PROJECT_DIR = origDir || "";

// Cleanup
fs.rmSync(tmpDir, {recursive: true, force: true});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
