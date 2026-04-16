#!/usr/bin/env node
"use strict";
// Tests for worktree-gate.js — enforce worktree-first workflow
// Updated for PR #350: gate now blocks ALL code edits in main checkout,
// regardless of session count or branch. Config/doc files are allowed.
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

function loadMod() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}
var mod = loadMod();
assert(typeof mod === "function", "module exports a function");

var src = fs.readFileSync(modPath, "utf-8");
assert(/\/\/\s*WHY:/.test(src), "has WHY comment");
assert(/\/\/\s*WORKFLOW:/.test(src), "has WORKFLOW comment");

// Setup: temp dir simulating a main checkout (.git is a directory)
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wt-gate-"));
var gitDir = path.join(tmpDir, ".git");
fs.mkdirSync(gitDir);
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");

var origDir = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = tmpDir;

// Test: main checkout + code file → block
mod = loadMod();
var r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r && r.decision === "block", "main checkout: code file blocks");
assert(r && r.reason && /worktree/i.test(r.reason), "block message mentions worktree");
assert(r && r.reason && /EnterWorktree/.test(r.reason), "block message mentions EnterWorktree");

// Test: main checkout + config file → allowed (allowlist)
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "TODO.md")}});
assert(r === null || r === undefined, "TODO.md allowed on main checkout");

r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, ".gitignore")}});
assert(r === null || r === undefined, ".gitignore allowed on main checkout");

r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "CLAUDE.md")}});
assert(r === null || r === undefined, "CLAUDE.md allowed on main checkout");

r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "package.json")}});
assert(r === null || r === undefined, ".json files allowed on main checkout");

// Test: worktree (.git is a file, not dir) → all edits pass
fs.rmSync(gitDir, {recursive: true});
fs.writeFileSync(gitDir, "gitdir: /some/main/repo/.git/worktrees/my-branch\n");
mod = loadMod();
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "worktree: code file passes");

// Test: Read tool → not gated
fs.unlinkSync(gitDir);
fs.mkdirSync(gitDir);
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
mod = loadMod();
r = mod({tool_name: "Read", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "Read tool not gated");

// Test: Bash tool → not gated
r = mod({tool_name: "Bash", tool_input: {command: "echo hi"}});
assert(r === null || r === undefined, "Bash tool not gated");

// Test: no .git at all → not a git repo, pass
fs.rmSync(gitDir, {recursive: true});
mod = loadMod();
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "no .git: passes (not a git repo)");

// Test: HOOK_RUNNER_TEST=1 skips gate
fs.mkdirSync(gitDir);
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
process.env.HOOK_RUNNER_TEST = "1";
mod = loadMod();
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "HOOK_RUNNER_TEST=1 skips gate");
delete process.env.HOOK_RUNNER_TEST;

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origDir || "";
fs.rmSync(tmpDir, {recursive: true, force: true});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
