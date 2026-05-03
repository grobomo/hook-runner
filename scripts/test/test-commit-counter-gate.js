#!/usr/bin/env node
"use strict";
// TIMEOUT: 90
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
  // T544: chdir to temp repo so isInWorktree() checks temp .git (dir), not CWD worktree (.git file)
  var origCwd = process.cwd();
  process.chdir(dir);
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "labs/dd-lab/terraform/main.tf"), old_string: "a", new_string: "b" } });
  process.chdir(origCwd);
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
  // Branch keyword "src" matches file dir "src" so mismatch won't fire
  var dir = createTempRepo("build-src-utils", ["src/app.js"]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  // T532: Also chdir to the temp dir — isInWorktree() now checks CWD too
  var origCwd = process.cwd();
  process.chdir(dir);
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "src/app.js"), old_string: "a", new_string: "b" } });
  process.chdir(origCwd);
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

// --- T485: worktreeRequired flag blocks git commit bypass ---

test("T485: git commit blocked when worktreeRequired flag is set (not in worktree)", function() {
  // Simulate: counter has worktreeRequired=true, session tries git commit
  var dir = createTempRepo("main", ["src/app.js"]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  // T532: Also chdir to the temp dir — isInWorktree() now checks CWD too
  var origCwd = process.cwd();
  process.chdir(dir);
  // Write counter with worktreeRequired flag
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: 15, ts: new Date().toISOString(), worktreeRequired: true }));

  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "git commit -m 'sneaky commit'" } });
  process.chdir(origCwd);
  assert(r !== null, "should block git commit");
  assert(r.decision === "block", "should be block decision");
  assert(r.reason.indexOf("WORKTREE REQUIRED") !== -1, "should mention WORKTREE REQUIRED");

  cleanupRepo(dir);
});

test("T485: git commit allowed when worktreeRequired is false", function() {
  var dir = createTempRepo("main", []);
  process.env.CLAUDE_PROJECT_DIR = dir;
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: 10, ts: new Date().toISOString(), worktreeRequired: false }));

  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "git commit -m 'normal commit'" } });
  assert(r === null, "should allow commit when worktreeRequired is false");
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.count === 0, "counter should reset to 0");

  cleanupRepo(dir);
});

test("T485: WRONG BRANCH sets worktreeRequired flag", function() {
  var dir = createTempRepo("001-T001-deploy-nfs-datasec", [
    "labs/dd-lab/terraform/main.tf",
    "labs/dd-lab/scripts/setup.sh"
  ]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  // T544: chdir to temp repo so isInWorktree() returns false
  var origCwd = process.cwd();
  process.chdir(dir);
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "labs/dd-lab/terraform/main.tf"), old_string: "a", new_string: "b" } });
  process.chdir(origCwd);
  assert(r !== null && r.reason.indexOf("WRONG BRANCH") !== -1, "should detect wrong branch");
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.worktreeRequired === true, "worktreeRequired flag should be set");

  cleanupRepo(dir);
});

test("T485: not-in-worktree block sets worktreeRequired flag", function() {
  var dir = createTempRepo("build-src-utils", ["src/utils.js"]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  // T532: Also chdir to the temp dir — isInWorktree() now checks CWD too
  var origCwd = process.cwd();
  process.chdir(dir);
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "src/utils.js"), old_string: "a", new_string: "b" } });
  process.chdir(origCwd);
  assert(r !== null && r.reason.indexOf("main checkout") !== -1, "should enforce worktree");
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.worktreeRequired === true, "worktreeRequired flag should be set");

  cleanupRepo(dir);
});

test("T485: worktreeRequired cleared on commit inside worktree", function() {
  // Simulate being in a worktree: .git is a file
  var dir = createTempRepo("worktree-T485-test", []);
  process.env.CLAUDE_PROJECT_DIR = dir;
  var gitDir = path.join(dir, ".git");
  var realGitDir = path.join(os.tmpdir(), "fake-git-t485-" + Date.now());
  fs.mkdirSync(realGitDir, { recursive: true });
  fs.cpSync(path.join(gitDir, "HEAD"), path.join(realGitDir, "HEAD"));
  fs.rmSync(gitDir, { recursive: true, force: true });
  fs.writeFileSync(gitDir, "gitdir: " + realGitDir);

  fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: 15, ts: new Date().toISOString(), worktreeRequired: true }));

  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "git commit -m 'commit in worktree'" } });
  // In worktree, commit should be allowed (worktreeRequired only blocks non-worktree)
  assert(r === null, "should allow commit inside worktree even with worktreeRequired");
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.worktreeRequired === false, "worktreeRequired should be cleared");

  fs.rmSync(realGitDir, { recursive: true, force: true });
  cleanupRepo(dir);
});

test("T497: metadata-only changes don't trigger WRONG BRANCH", function() {
  // Branch about audit, but only .claude/ and .coconut/ files changed
  var dir = createTempRepo("worktree-T494-audit-project-cmd", [
    ".claude/worktrees/foo/bar.js",
    ".coconut/STATUS_REPORT.md",
    ".github/workflows/ci.yml"
  ]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, ".coconut/STATUS_REPORT.md"), old_string: "a", new_string: "b" } });
  // Should NOT say WRONG BRANCH — metadata dirs are excluded from keyword matching
  assert(r === null || r.reason.indexOf("WRONG BRANCH") === -1,
    "metadata-only changes should not trigger WRONG BRANCH, got: " + (r ? r.reason.substring(0, 80) : "null"));

  cleanupRepo(dir);
});

test("T497: real files + metadata files still detect mismatch", function() {
  // Branch about deploy, but real files are in labs/ (mismatch), plus metadata
  var dir = createTempRepo("001-T001-deploy-nfs-datasec", [
    "labs/dd-lab/main.tf",
    ".claude/hooks/foo.js",
    ".coconut/STATUS_REPORT.md"
  ]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  // T544: chdir to temp repo so isInWorktree() returns false
  var origCwd = process.cwd();
  process.chdir(dir);
  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "labs/dd-lab/main.tf"), old_string: "a", new_string: "b" } });
  process.chdir(origCwd);
  // labs/dd-lab doesn't match deploy/nfs/datasec → should still detect mismatch
  assert(r !== null && r.reason.indexOf("WRONG BRANCH") !== -1,
    "should still detect mismatch when real files don't match branch");

  cleanupRepo(dir);
});

test("T540: mismatch in worktree gives commit guidance, not WRONG BRANCH", function() {
  // Branch about server-bugs, files in patches/ — mismatch, but we're in a worktree
  // Worktrees are already isolated, so mismatch should be advisory not blocking
  var dir = createTempRepo("fix-server-bugs", [
    "patches/hotfix-1.diff",
    "patches/hotfix-2.diff"
  ]);
  process.env.CLAUDE_PROJECT_DIR = dir;

  // Convert .git dir to a file (simulating worktree)
  var gitDir = path.join(dir, ".git");
  var realGitDir = path.join(os.tmpdir(), "fake-git-t540-" + Date.now());
  fs.mkdirSync(realGitDir, { recursive: true });
  fs.cpSync(path.join(gitDir, "HEAD"), path.join(realGitDir, "HEAD"));
  // Copy refs so git status works
  try { fs.cpSync(path.join(gitDir, "refs"), path.join(realGitDir, "refs"), { recursive: true }); } catch(e) {}
  try { fs.cpSync(path.join(gitDir, "objects"), path.join(realGitDir, "objects"), { recursive: true }); } catch(e) {}
  try { fs.cpSync(path.join(gitDir, "config"), path.join(realGitDir, "config")); } catch(e) {}
  fs.rmSync(gitDir, { recursive: true, force: true });
  fs.writeFileSync(gitDir, "gitdir: " + realGitDir);

  setCounter(14);

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "patches/hotfix-1.diff"), old_string: "a", new_string: "b" } });
  // In a worktree, even with mismatch, should NOT get WRONG BRANCH — should get standard commit guidance or pass
  if (r !== null) {
    assert(r.reason.indexOf("WRONG BRANCH") === -1,
      "worktree mismatch should NOT say WRONG BRANCH, got: " + r.reason.substring(0, 150));
    assert(r.reason.indexOf("EnterWorktree") === -1,
      "should not recommend EnterWorktree when already in one");
  }

  // worktreeRequired should NOT be set
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.worktreeRequired !== true,
    "worktreeRequired should not be set in a worktree");

  fs.rmSync(realGitDir, { recursive: true, force: true });
  cleanupRepo(dir);
});

// --- T547: State file tampering detection ---

test("T547: blocks Bash commands referencing counter state file", function() {
  resetCounter();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: 'node -e "fs.writeFileSync(...uncommitted-edit-count...)"' } });
  assert(r !== null, "should block");
  assert(r.decision === "block", "should be block decision");
  assert(r.reason.indexOf("STATE TAMPERING") !== -1, "should mention state tampering, got: " + r.reason.substring(0, 100));
});

test("T547: blocks Bash commands referencing spec-before-code state file", function() {
  resetCounter();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: 'cat ~/.claude/hooks/.spec-before-code-state | jq .' } });
  assert(r !== null, "should block");
  assert(r.reason.indexOf("STATE TAMPERING") !== -1, "should mention state tampering");
});

test("T547: allows Bash commands that don't reference state files", function() {
  resetCounter();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "git status" } });
  assert(r === null, "should pass");
});

test("T547: allows git commit with state file name in message", function() {
  resetCounter();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "git commit -m 'fix uncommitted-edit-count handling'" } });
  // git commit is handled by the commit handler, not the tamper detector
  assert(r === null, "should allow git commit even if message mentions state file");
});

test("T547: HMAC integrity violation detected on git commit", function() {
  var dir = createTempRepo("main", []);
  process.env.CLAUDE_PROJECT_DIR = dir;
  // Write counter with an HMAC field but wrong value (simulates external tampering)
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({
    count: 0, ts: new Date().toISOString(), worktreeRequired: false, hmac: "deadbeef12345678"
  }));

  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "git commit -m 'after tamper'" } });
  assert(r !== null, "should block");
  assert(r.decision === "block", "should be block decision");
  assert(r.reason.indexOf("INTEGRITY VIOLATION") !== -1,
    "should mention integrity violation, got: " + r.reason.substring(0, 150));

  cleanupRepo(dir);
});

test("T547: HMAC integrity violation detected on file edit", function() {
  // Write counter with bad HMAC at count=0 — the edit should detect tamper on read
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({
    count: 0, ts: new Date().toISOString(), worktreeRequired: true, hmac: "baadcafe00000000"
  }));

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.js", old_string: "a", new_string: "b" } });
  assert(r !== null, "should block");
  assert(r.reason.indexOf("INTEGRITY VIOLATION") !== -1,
    "should mention integrity violation, got: " + r.reason.substring(0, 150));
});

test("T547: legacy counter (no HMAC) treated as valid", function() {
  // Write counter without HMAC field — legacy format should be trusted
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({
    count: 5, ts: new Date().toISOString(), worktreeRequired: false
  }));

  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.js", old_string: "a", new_string: "b" } });
  assert(r === null, "should pass (legacy counter, count only 6)");
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.count === 6, "counter should increment to 6");
  assert(data.hmac, "should now have HMAC after gate writes");
});

test("T547: counter written by gate passes HMAC check on re-read", function() {
  // Let the gate write a counter, then read it back — should not be tampered
  resetCounter();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.js", old_string: "a", new_string: "b" } });
  // Now the counter has count=1 with valid HMAC. Another edit should work fine.
  gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test2.js", old_string: "a", new_string: "b" } });
  assert(r === null, "should pass (count=2, valid HMAC)");
  var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
  assert(data.count === 2, "counter should be 2");
});

// --- T547: Walk-up worktree detection ---

test("T547: isInWorktree detects worktree from subdirectory of worktree root", function() {
  // Create a main checkout, then create a fake worktree as a subdirectory
  var mainDir = createTempRepo("main", []);
  var worktreeDir = path.join(mainDir, ".claude", "worktrees", "test-wt");
  fs.mkdirSync(worktreeDir, { recursive: true });
  // Make the worktree's .git a file (the worktree marker)
  var realGitDir = path.join(os.tmpdir(), "fake-git-walk-" + Date.now());
  fs.mkdirSync(realGitDir, { recursive: true });
  fs.writeFileSync(path.join(realGitDir, "HEAD"), "ref: refs/heads/test-branch\n");
  fs.writeFileSync(path.join(worktreeDir, ".git"), "gitdir: " + realGitDir);

  // Create a subdirectory inside the worktree (simulates CWD being deeper)
  var subDir = path.join(worktreeDir, "src", "components");
  fs.mkdirSync(subDir, { recursive: true });

  // Point CLAUDE_PROJECT_DIR at main checkout (like real EnterWorktree does)
  process.env.CLAUDE_PROJECT_DIR = mainDir;
  var origCwd = process.cwd();
  // Set CWD to subdirectory of worktree
  process.chdir(subDir);

  // The counter needs worktreeRequired + high count to trigger isInWorktree check
  setCounter(14);
  // Create dirty files in the main repo so git diff > 0
  fs.mkdirSync(path.join(mainDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(mainDir, "src/app.js"), "dirty");
  cp.execFileSync("git", ["add", "src/app.js"], { cwd: mainDir, windowsHide: true });

  var gate = loadGate();
  // Use git commit which checks isInWorktree via worktreeRequired path
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({
    count: 15, ts: new Date().toISOString(), worktreeRequired: true
  }));
  var r = gate({ tool_name: "Bash", tool_input: { command: "git commit -m 'test'" } });

  process.chdir(origCwd);

  // Should NOT block — we're in a worktree (walk-up should find .git file)
  assert(r === null, "should allow commit — walk-up should detect worktree from subdirectory, got: " +
    (r ? r.reason.substring(0, 150) : "null"));

  fs.rmSync(realGitDir, { recursive: true, force: true });
  cleanupRepo(mainDir);
});

test("T547: isInWorktree returns false when CWD is in main checkout subdirectory", function() {
  // Main checkout with .git directory (not file) — walking up should find .git dir and return false
  var dir = createTempRepo("build-src-utils", ["src/utils.js"]);
  process.env.CLAUDE_PROJECT_DIR = dir;
  var subDir = path.join(dir, "src");
  var origCwd = process.cwd();
  process.chdir(subDir);

  // Set worktreeRequired and try to commit
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({
    count: 15, ts: new Date().toISOString(), worktreeRequired: true
  }));

  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "git commit -m 'test'" } });
  process.chdir(origCwd);

  // Should block — we're in main checkout (walk-up finds .git dir, not file)
  assert(r !== null, "should block — main checkout subdir is not a worktree");
  assert(r.reason.indexOf("WORKTREE REQUIRED") !== -1, "should say WORKTREE REQUIRED");

  cleanupRepo(dir);
});

// --- Cleanup ---
process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
process.env.HOOK_RUNNER_TEST = origTestEnv || "";
resetCounter();

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
