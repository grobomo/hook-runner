#!/usr/bin/env node
"use strict";
// T392: Tests for worktree-gate.js — enforce worktree usage for feature branches
// Gate only blocks when another Claude session is active (multi-tab detection)
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var pass = 0, fail = 0;
function assert(ok, label) {
  if (ok) { pass++; console.log("OK: " + label); }
  else { fail++; console.log("FAIL: " + label); }
}

var modPath = path.join(__dirname, "../../modules/PreToolUse/worktree-gate.js");
assert(fs.existsSync(modPath), "module file exists");

// Re-require fresh each time to avoid caching issues
function loadMod() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}
var mod = loadMod();
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
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/258-T382-lesson-effectiveness\n");

var origDir = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = tmpDir;

// Helper: create a fake session lock file for another "session"
// Uses a long-lived process PID (node itself) to simulate an active session
function createFakeLock() {
  var prefix = ".claude-session-lock-" +
    tmpDir.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").substring(0, 80) + "-";
  // Use PID 4 (System process on Windows, always running) as the "other session"
  // On Linux use PID 1 (init)
  var fakePid = process.platform === "win32" ? 4 : 1;
  var lockFile = path.join(os.tmpdir(), prefix + fakePid);
  fs.writeFileSync(lockFile, "fake-session");
  return lockFile;
}

// Test: single session (no other lock files) → pass even on feature branch
var r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "single session: feature branch passes");

// Test: multi-session (fake lock file) + feature branch → block
var fakeLock = createFakeLock();
mod = loadMod();
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r && r.decision === "block", "multi-session: feature branch blocks");
assert(r && r.reason && r.reason.indexOf("worktree") >= 0, "block message mentions worktree");
assert(r && r.reason && r.reason.indexOf("Another Claude session") >= 0, "block message explains why");

// Test: main branch → pass even with other sessions
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "multi-session: main branch passes");

// Test: worktree (.git is a file, not dir) → pass even with other sessions
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/258-T382-lesson-effectiveness\n");
fs.rmSync(gitDir, {recursive: true});
fs.writeFileSync(gitDir, "gitdir: /some/main/repo/.git/worktrees/258-T382\n");
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "multi-session: worktree passes");

// Test: Read tool → pass (not gated)
fs.unlinkSync(gitDir);
fs.mkdirSync(gitDir);
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/feat/something\n");
r = mod({tool_name: "Read", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "Read tool not gated");

// Test: Bash tool → pass (not gated)
r = mod({tool_name: "Bash", tool_input: {command: "echo hi"}});
assert(r === null || r === undefined, "Bash tool not gated");

// Test: no specs/ dir → pass even with other sessions
fs.rmSync(specsDir, {recursive: true});
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/feat/something\n");
r = mod({tool_name: "Edit", tool_input: {file_path: path.join(tmpDir, "foo.js")}});
assert(r === null || r === undefined, "no specs dir passes (not SHTD repo)");

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origDir || "";
try { fs.unlinkSync(fakeLock); } catch(e) {}
fs.rmSync(tmpDir, {recursive: true, force: true});

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
