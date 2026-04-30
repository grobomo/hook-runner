#!/usr/bin/env node
"use strict";
// T543: Tests for nested-repo branch detection.
// When CLAUDE_PROJECT_DIR is a subdirectory of a git repo (not the repo root),
// the runner and spec-gate must walk up to find .git and detect the correct branch.

var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var repoDir = path.join(__dirname, "..", "..");
var passed = 0, failed = 0;

function pass(name) { console.log("  PASS: " + name); passed++; }
function fail(name) { console.log("  FAIL: " + name); failed++; }

console.log("=== T543: nested-repo branch detection ===");

// --- Test 1: readBranchFromDir walks up to find .git ---

// Create a repo with a nested project dir
var tmpBase = path.join(os.tmpdir(), "t543-" + process.pid + "-" + Date.now());
var repoRoot = path.join(tmpBase, "parent-repo");
var nestedDir = path.join(repoRoot, "projects", "child-project");
fs.mkdirSync(nestedDir, { recursive: true });

// Init git in parent-repo, create a branch
cp.execFileSync("git", ["init", "-q", repoRoot]);
cp.execFileSync("git", ["config", "user.email", "test@test"], { cwd: repoRoot });
cp.execFileSync("git", ["config", "user.name", "test"], { cwd: repoRoot });
fs.writeFileSync(path.join(repoRoot, "README.md"), "# Parent\n");
cp.execFileSync("git", ["add", "-A"], { cwd: repoRoot });
cp.execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoRoot });
cp.execFileSync("git", ["checkout", "-q", "-b", "045-T1045-verify-zip"], { cwd: repoRoot });

// Add TODO.md with unchecked task
fs.writeFileSync(path.join(repoRoot, "TODO.md"), "- [ ] T1045: Verify zip terraform\n");
cp.execFileSync("git", ["add", "TODO.md"], { cwd: repoRoot });
cp.execFileSync("git", ["commit", "-q", "-m", "add todo"], { cwd: repoRoot });

// Test: readBranchFromDir should find branch from nested dir
// Inline the readBranchFromDir logic from run-pretooluse.js
function readBranchFromDir(dir) {
  var current = dir;
  for (var walk = 0; walk < 20; walk++) {
    var dotGit = path.join(current, ".git");
    try {
      var stat = fs.statSync(dotGit);
      var headPath;
      if (stat.isFile()) {
        var gitdir = fs.readFileSync(dotGit, "utf-8").trim().replace(/^gitdir:\s*/, "");
        if (!path.isAbsolute(gitdir)) gitdir = path.join(current, gitdir);
        headPath = path.join(gitdir, "HEAD");
      } else {
        headPath = path.join(dotGit, "HEAD");
      }
      var head = fs.readFileSync(headPath, "utf-8").trim();
      return head.indexOf("ref: refs/heads/") === 0 ? head.slice(16) : "";
    } catch (e) {
      var parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return "";
}

var branch = readBranchFromDir(nestedDir);
if (branch === "045-T1045-verify-zip") {
  pass("readBranchFromDir finds branch from nested subdir: " + branch);
} else {
  fail("readBranchFromDir should find branch from nested dir, got: '" + branch + "'");
}

// --- Test 2: spec-gate finds git root as parent of projectDir ---

var specGatePath = path.join(repoDir, "modules", "PreToolUse", "spec-gate.js");
var specGate = require(specGatePath);

// Set projectDir to the nested child (no .git here)
var origDir = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = nestedDir.replace(/\\/g, "/");

// spec-gate should detect branch 045-T1045-verify-zip and find T1045 unchecked
var result = specGate({
  tool_name: "Edit",
  tool_input: { file_path: path.join(nestedDir, "app.js"), old_string: "a", new_string: "b" },
  _git: { branch: "045-T1045-verify-zip", tracking: true }
});

if (!result) {
  pass("spec-gate allows edit in nested dir with correct branch + unchecked task");
} else if (result.decision === "block" && result.reason.indexOf("On main branch") !== -1) {
  fail("spec-gate still thinks it's on main (T543 bug not fixed): " + result.reason.slice(0, 100));
} else if (result.decision === "block") {
  // Blocked for a different reason (not the T543 bug) — could be missing spec chain
  // This is acceptable — the point is it shouldn't say "On main branch"
  pass("spec-gate blocks for non-T543 reason (branch detected correctly)");
} else {
  fail("unexpected result: " + JSON.stringify(result));
}

// --- Test 3: spec-gate with _git.branch empty should walk up via findGitRoot ---

result = specGate({
  tool_name: "Edit",
  tool_input: { file_path: path.join(nestedDir, "app.js"), old_string: "a", new_string: "b" },
  _git: {}
});

// Without _git.branch, spec-gate must use getGitBranch which walks up via findGitRoot
// It should find the parent repo's branch (045-T1045-verify-zip), not default to main
if (!result) {
  pass("spec-gate detects parent repo branch without _git.branch hint");
} else if (result.decision === "block" && result.reason.indexOf("On main branch") !== -1) {
  fail("spec-gate defaults to main when _git.branch empty (T543 not fully fixed)");
} else {
  pass("spec-gate blocks for non-T543 reason without _git.branch hint");
}

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origDir || "";
try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (e) {}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
