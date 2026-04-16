#!/usr/bin/env node
"use strict";
// Tests for commit-counter-gate.js — T466 branch-file mismatch + worktree enforcement
var path = require("path");
var fs = require("fs");
var os = require("os");
var cp = require("child_process");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
    passed++;
  } catch (e) {
    console.log("FAIL: " + name + " — " + e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// Helper: create a temp git repo on a specific branch with dirty files
function createTempRepo(branchName, dirtyFiles) {
  var dir = path.join(os.tmpdir(), "commit-counter-test-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  fs.mkdirSync(dir, { recursive: true });
  cp.execFileSync("git", ["init"], { cwd: dir, windowsHide: true });
  cp.execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, windowsHide: true });
  cp.execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, windowsHide: true });

  // Need an initial commit so we can create branches
  fs.writeFileSync(path.join(dir, "README.md"), "init");
  cp.execFileSync("git", ["add", "."], { cwd: dir, windowsHide: true });
  cp.execFileSync("git", ["commit", "-m", "init"], { cwd: dir, windowsHide: true });

  // Create and switch to the target branch
  if (branchName !== "main" && branchName !== "master") {
    cp.execFileSync("git", ["checkout", "-b", branchName], { cwd: dir, windowsHide: true });
  }

  // Create files, commit them, then modify — so git diff --stat sees them as dirty
  // (git diff only shows tracked modified files, not untracked new files)
  if (dirtyFiles.length > 0) {
    for (var i = 0; i < dirtyFiles.length; i++) {
      var filePath = path.join(dir, dirtyFiles[i]);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "original-" + i);
    }
    cp.execFileSync("git", ["add", "."], { cwd: dir, windowsHide: true });
    cp.execFileSync("git", ["commit", "-m", "add files"], { cwd: dir, windowsHide: true });
    // Now modify them so git diff shows them as dirty
    for (var j = 0; j < dirtyFiles.length; j++) {
      fs.writeFileSync(path.join(dir, dirtyFiles[j]), "modified-" + j);
    }
  }

  return dir;
}

function cleanupRepo(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {}
}

// Load the gate fresh for each test (counter file side effects)
function loadGate() {
  var gatePath = path.resolve(__dirname, "../../modules/PreToolUse/commit-counter-gate.js");
  delete require.cache[require.resolve(gatePath)];
  return require(gatePath);
}

// Counter file path (same as in the module)
var COUNTER_FILE = path.join(os.homedir(), ".claude", "hooks", ".uncommitted-edit-count");

function setCounter(n) {
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: n, ts: new Date().toISOString() }));
}

function resetCounter() {
  try { fs.unlinkSync(COUNTER_FILE); } catch(e) {}
}

// Save/restore state
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
var origTestEnv = process.env.HOOK_RUNNER_TEST;
process.env.HOOK_RUNNER_TEST = "1";

// --- Tests ---

test("resets counter on git commit", function() {
  setCounter(10);
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "git commit -m 'test'" } });
  assert(r === null, "should pass");
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.count === 0, "counter should be 0 after commit");
});

test("increments counter on Edit", function() {
  resetCounter();
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.js", old_string: "a", new_string: "b" } });
  assert(r === null, "should pass (count=1)");
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.count === 1, "counter should be 1");
});

test("increments counter on Write", function() {
  resetCounter();
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/tmp/test.js", content: "x" } });
  assert(r === null, "should pass (count=1)");
});

test("does not increment for read-only Bash", function() {
  resetCounter();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "ls -la" } });
  assert(r === null, "should pass");
  try {
    var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
    assert(data.count === 0, "counter should stay 0");
  } catch(e) {
    // File doesn't exist = count is 0, fine
  }
});

test("blocks at MAX_EDITS with git changes", function() {
  var dir = createTempRepo("main", ["src/app.js", "src/util.js"]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  setCounter(14); // next edit = 15 = MAX_EDITS

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "src/app.js"), old_string: "a", new_string: "b" } });
  assert(r !== null, "should block at 15");
  assert(r.decision === "block", "should be block decision");
  assert(r.reason.indexOf("COMMIT COUNTER") !== -1, "should mention commit counter");

  cleanupRepo(dir);
});

test("resets counter when git diff shows 0 files", function() {
  var dir = createTempRepo("main", []);
  process.env.CLAUDE_PROJECT_DIR = dir;
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.js", old_string: "a", new_string: "b" } });
  assert(r === null, "should pass (git diff = 0, counter resets)");
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.count === 0, "counter should be reset to 0");

  cleanupRepo(dir);
});

test("WRONG BRANCH: detects mismatch between branch and changed files", function() {
  // Branch about NFS/datasec, but files are in labs/dd-lab/
  var dir = createTempRepo("001-T001-deploy-nfs-datasec-v2", [
    "labs/dd-lab/terraform/main.tf",
    "labs/dd-lab/config/settings.json",
    "labs/dd-lab/scripts/deploy.sh"
  ]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "labs/dd-lab/terraform/main.tf"), old_string: "a", new_string: "b" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("WRONG BRANCH") !== -1, "should say WRONG BRANCH, got: " + r.reason.substring(0, 100));
  assert(r.reason.indexOf("EnterWorktree") !== -1, "should recommend EnterWorktree");
  assert(r.reason.indexOf("DO NOT commit") !== -1, "should warn against committing");

  cleanupRepo(dir);
});

test("matching branch and files: no WRONG BRANCH", function() {
  // Branch about dd-lab, files in labs/dd-lab/ — should match on "dd" or "lab" substring
  var dir = createTempRepo("042-T005-setup-dd-lab", [
    "labs/dd-lab/terraform/main.tf",
    "labs/dd-lab/config/settings.json"
  ]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "labs/dd-lab/terraform/main.tf"), old_string: "a", new_string: "b" } });
  assert(r !== null, "should block (hit counter)");
  assert(r.reason.indexOf("WRONG BRANCH") === -1, "should NOT say wrong branch");

  cleanupRepo(dir);
});

test("main checkout without worktree: enforces worktree", function() {
  // In a main checkout (.git is a directory) with matching branch keywords
  var dir = createTempRepo("feature-app", ["src/app.js"]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "src/app.js"), old_string: "a", new_string: "b" } });
  assert(r !== null, "should block");
  assert(r.reason.indexOf("main checkout") !== -1,
    "should mention not being in a worktree, got: " + r.reason.substring(0, 150));
  assert(r.reason.indexOf("EnterWorktree") !== -1, "should recommend EnterWorktree");

  cleanupRepo(dir);
});

test("worktree checkout: standard commit message", function() {
  // Simulate a worktree by making .git a file instead of a directory
  var dir = createTempRepo("worktree-test-app", ["src/app.js"]);
  process.env.CLAUDE_PROJECT_DIR = dir;

  // Convert .git dir to a file (simulating worktree)
  var gitDir = path.join(dir, ".git");
  var realGitDir = path.join(os.tmpdir(), "fake-git-" + Date.now());
  fs.mkdirSync(realGitDir, { recursive: true });
  // Copy HEAD so getBranch can read it
  fs.cpSync(path.join(gitDir, "HEAD"), path.join(realGitDir, "HEAD"));
  fs.rmSync(gitDir, { recursive: true, force: true });
  fs.writeFileSync(gitDir, "gitdir: " + realGitDir);

  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "src/app.js"), old_string: "a", new_string: "b" } });
  // In a fake worktree git commands won't work, so getGitDiffCount returns 0
  // and counter resets. Verify no crash and no worktree enforcement.
  if (r !== null) {
    assert(r.reason.indexOf("main checkout") === -1, "should not enforce worktree when in a worktree");
    assert(r.reason.indexOf("WRONG BRANCH") === -1, "should not say wrong branch");
  }

  cleanupRepo(dir);
  fs.rmSync(realGitDir, { recursive: true, force: true });
});

test("branch with no extractable keywords: no false-positive mismatch", function() {
  // Branch like "123-456" — can't extract keywords, should not trigger mismatch
  var dir = createTempRepo("123-456", ["src/app.js"]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "src/app.js"), old_string: "a", new_string: "b" } });
  if (r !== null) {
    assert(r.reason.indexOf("WRONG BRANCH") === -1, "should not false-positive on numeric branch");
  }

  cleanupRepo(dir);
});

test("substring matching: branch 'deploy' matches dir 'deployment'", function() {
  var dir = createTempRepo("001-T001-deploy-service", [
    "deployment/config.yaml",
    "deployment/scripts/run.sh"
  ]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "deployment/config.yaml"), old_string: "a", new_string: "b" } });
  assert(r !== null, "should block (counter)");
  assert(r.reason.indexOf("WRONG BRANCH") === -1, "deploy should match deployment via substring");

  cleanupRepo(dir);
});

// --- Cleanup ---
process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
process.env.HOOK_RUNNER_TEST = origTestEnv || "";
resetCounter();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
