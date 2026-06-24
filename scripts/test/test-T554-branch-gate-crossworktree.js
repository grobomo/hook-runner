#!/usr/bin/env node
// Test T554: branch-pr-gate resolves branch from target file's git root,
// not from CWD, when Edit/Write targets a file in a different repo/worktree.
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var execFileSync = require("child_process").execFileSync;

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  PASS: " + name);
  } catch (e) {
    failed++;
    console.log("  FAIL: " + name + " — " + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// Create temp dirs simulating two repos
var tmpBase = path.join(os.tmpdir(), "t554-" + Date.now());
var repoA = path.join(tmpBase, "repo-a"); // "main tree" on task branch
var repoB = path.join(tmpBase, "repo-b"); // "worktree" on feature branch

fs.mkdirSync(repoA, { recursive: true });
fs.mkdirSync(repoB, { recursive: true });

// Init repo A on a task branch (017-T004-fix-launch-ux)
execFileSync("git", ["init"], { cwd: repoA });
execFileSync("git", ["checkout", "-b", "017-T004-fix-launch-ux"], { cwd: repoA });
fs.writeFileSync(path.join(repoA, "app.js"), "// test file");
execFileSync("git", ["add", "."], { cwd: repoA });
execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@test", "commit", "-m", "init"], { cwd: repoA });

// Init repo B on a bare feature branch (worktree-011-split-reset)
execFileSync("git", ["init"], { cwd: repoB });
execFileSync("git", ["checkout", "-b", "worktree-011-split-reset"], { cwd: repoB });
fs.writeFileSync(path.join(repoB, "dummy.js"), "// dummy");
execFileSync("git", ["add", "."], { cwd: repoB });
execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@test", "commit", "-m", "init"], { cwd: repoB });

// Load the module
var modulePath = path.resolve(__dirname, "../../modules/PreToolUse/branch-pr-gate.js");
// Clear require cache so we get a fresh load
delete require.cache[require.resolve(modulePath)];
var gate = require(modulePath);

// Save original CWD
var origCwd = process.cwd();
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;

console.log("T554: branch-pr-gate cross-worktree tests");

// --- Core fix test ---
test("Edit targeting repo-A (task branch) from CWD=repo-B (feature branch) should PASS", function() {
  // Simulate: CWD is repo-B (bare feature branch), editing file in repo-A (task branch)
  process.chdir(repoB);
  process.env.CLAUDE_PROJECT_DIR = repoB;
  var result = gate({
    tool_name: "Edit",
    tool_input: {
      file_path: path.join(repoA, "app.js"),
      old_string: "test",
      new_string: "test2"
    }
  });
  assert(result === null, "Expected null (pass), got: " + JSON.stringify(result));
});

test("Write targeting repo-A (task branch) from CWD=repo-B (feature branch) should PASS", function() {
  process.chdir(repoB);
  process.env.CLAUDE_PROJECT_DIR = repoB;
  var result = gate({
    tool_name: "Write",
    tool_input: {
      file_path: path.join(repoA, "app.js"),
      content: "// updated"
    }
  });
  assert(result === null, "Expected null (pass), got: " + JSON.stringify(result));
});

// --- Ensure gate still blocks when target file IS on a bad branch ---
test("Edit targeting repo-B (bare feature branch) from CWD=repo-B should BLOCK", function() {
  process.chdir(repoB);
  process.env.CLAUDE_PROJECT_DIR = repoB;
  var result = gate({
    tool_name: "Edit",
    tool_input: {
      file_path: path.join(repoB, "dummy.js"),
      old_string: "dummy",
      new_string: "dummy2"
    }
  });
  assert(result && result.decision === "block", "Expected block, got: " + JSON.stringify(result));
  assert(/BLOCKED/i.test(result.reason), "Expected BLOCKED in reason");
});

// --- Edit on main should still block ---
test("Edit targeting repo on main should BLOCK", function() {
  // Create a repo on main
  var repoMain = path.join(tmpBase, "repo-main");
  fs.mkdirSync(repoMain, { recursive: true });
  execFileSync("git", ["init"], { cwd: repoMain });
  fs.writeFileSync(path.join(repoMain, "code.js"), "// main code");
  execFileSync("git", ["add", "."], { cwd: repoMain });
  execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@test", "commit", "-m", "init"], { cwd: repoMain });

  process.chdir(repoMain);
  process.env.CLAUDE_PROJECT_DIR = repoMain;
  var result = gate({
    tool_name: "Edit",
    tool_input: {
      file_path: path.join(repoMain, "code.js"),
      old_string: "main",
      new_string: "main2"
    }
  });
  assert(result && result.decision === "block", "Expected block on main, got: " + JSON.stringify(result));
});

// --- Bash commands still use CWD-based branch (no targetFile) ---
test("Bash git commit from CWD=repo-B (feature branch) should BLOCK", function() {
  process.chdir(repoB);
  process.env.CLAUDE_PROJECT_DIR = repoB;
  var result = gate({
    tool_name: "Bash",
    tool_input: {
      command: "git commit -m 'test'"
    }
  });
  assert(result && result.decision === "block", "Expected block for Bash on feature branch, got: " + JSON.stringify(result));
});

test("Bash git commit from CWD=repo-A (task branch) should PASS", function() {
  process.chdir(repoA);
  process.env.CLAUDE_PROJECT_DIR = repoA;
  var result = gate({
    tool_name: "Bash",
    tool_input: {
      command: "git commit -m 'test'"
    }
  });
  assert(result === null, "Expected null (pass) for Bash on task branch, got: " + JSON.stringify(result));
});

// --- findGitRoot for files in subdirectories ---
test("Edit targeting file in subdirectory of repo-A should resolve to repo-A branch", function() {
  var subDir = path.join(repoA, "src", "lib");
  fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, "util.js"), "// util");

  process.chdir(repoB);
  process.env.CLAUDE_PROJECT_DIR = repoB;
  var result = gate({
    tool_name: "Edit",
    tool_input: {
      file_path: path.join(subDir, "util.js"),
      old_string: "util",
      new_string: "util2"
    }
  });
  assert(result === null, "Expected null (pass) for subdir file, got: " + JSON.stringify(result));
});

// --- Cleanup ---
process.chdir(origCwd);
if (origProjectDir !== undefined) {
  process.env.CLAUDE_PROJECT_DIR = origProjectDir;
} else {
  delete process.env.CLAUDE_PROJECT_DIR;
}

// Clean up temp dirs
try {
  fs.rmSync(tmpBase, { recursive: true, force: true });
} catch(e) { /* Windows sometimes locks .git files */ }

console.log("\nResults: " + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
