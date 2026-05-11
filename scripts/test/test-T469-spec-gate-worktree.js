#!/usr/bin/env node
"use strict";
// Tests for T469: spec-gate worktree support
// - getGitBranch handles worktree .git files
// - CWD-based root detection for worktrees inside project dir
// - Branch preference: non-main over main
process.env.SPEC_GATE_ACTIVE = "1"; // T624: force activation for testing
var path = require("path");
var fs = require("fs");
var os = require("os");

var PASS = 0, FAIL = 0;
function pass(msg) { console.log("OK: " + msg); PASS++; }
function fail(msg) { console.log("FAIL: " + msg); FAIL++; }

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "PreToolUse", "spec-gate.js");

function freshModule() {
  // Clear all caches
  delete require.cache[require.resolve(MOD_PATH)];
  Object.keys(require.cache).forEach(function(k) {
    if (k.indexOf("workflow.js") !== -1) delete require.cache[k];
  });
  return require(MOD_PATH);
}

function runGate(projectDir, filePath, branch) {
  var mod = freshModule();
  var input = {
    tool_name: "Edit",
    tool_input: { file_path: filePath },
    _git: { branch: branch || "" }
  };
  process.env.CLAUDE_PROJECT_DIR = projectDir;
  var result = mod(input);
  return result;
}

function runBashGate(projectDir, command, branch) {
  var mod = freshModule();
  var input = {
    tool_name: "Bash",
    tool_input: { command: command },
    _git: { branch: branch || "" }
  };
  process.env.CLAUDE_PROJECT_DIR = projectDir;
  var result = mod(input);
  return result;
}

// Create temp dirs
var TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), "t469-"));
process.on("exit", function() {
  try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch(e) {}
});

console.log("=== hook-runner: spec-gate worktree support (T469) ===\n");

// --- Test 1: getGitBranch reads worktree .git file ---
// Create a "main checkout" with .git directory
var mainDir = path.join(TMPDIR, "main-checkout");
var gitDir = path.join(mainDir, ".git");
fs.mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });
fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");
fs.mkdirSync(path.join(mainDir, "specs", "feat1"), { recursive: true });
fs.writeFileSync(path.join(mainDir, "specs", "feat1", "spec.md"), "# Spec");
fs.writeFileSync(path.join(mainDir, "specs", "feat1", "tasks.md"), "- [ ] T469: Fix worktree\n");
fs.writeFileSync(path.join(mainDir, "TODO.md"), "- [ ] T469: Fix worktree support\n");
fs.mkdirSync(path.join(mainDir, "src"), { recursive: true });
fs.writeFileSync(path.join(mainDir, "src", "app.js"), "x");

// Create a worktree inside main checkout
var wtDir = path.join(mainDir, ".claude", "worktrees", "T469-test");
fs.mkdirSync(wtDir, { recursive: true });
// Worktree .git is a FILE pointing to gitdir
var wtGitDir = path.join(gitDir, "worktrees", "T469-test");
fs.mkdirSync(wtGitDir, { recursive: true });
fs.writeFileSync(path.join(wtDir, ".git"), "gitdir: " + wtGitDir.replace(/\\/g, "/") + "\n");
fs.writeFileSync(path.join(wtGitDir, "HEAD"), "ref: refs/heads/worktree-T469-test\n");
// Worktree has its own TODO.md
fs.writeFileSync(path.join(wtDir, "TODO.md"), "- [ ] T469: Fix worktree support\n");
fs.mkdirSync(path.join(wtDir, "src"), { recursive: true });
fs.writeFileSync(path.join(wtDir, "src", "app.js"), "x");

// Test 1a: Branch passed via _git.branch — should work as before
var r = runGate(mainDir.replace(/\\/g, "/"), path.join(mainDir, "src", "app.js"), "worktree-T469-test");
if (!r) {
  pass("Branch via _git.branch on main checkout: allowed");
} else {
  fail("Branch via _git.branch on main checkout: blocked — " + (r.reason || "").substring(0, 80));
}

// Test 1b: No _git.branch, on main with specs/ — should block (requires feature branch)
var r2 = runGate(mainDir.replace(/\\/g, "/"), path.join(mainDir, "src", "app.js"), "");
if (r2 && r2.decision === "block" && r2.reason.indexOf("main branch") !== -1) {
  pass("No branch on main with specs/: blocks (requires feature branch)");
} else {
  fail("No branch on main with specs/ should block: " + JSON.stringify(r2));
}

// Test 1c: No _git.branch, main checkout .git/HEAD is main — getGitBranch should return main
// (This verifies the function still works for normal repos)
var r3 = runGate(mainDir.replace(/\\/g, "/"), path.join(mainDir, "src", "app.js"), "");
if (r3 && r3.decision === "block") {
  pass("getGitBranch reads normal .git/HEAD correctly (detects main)");
} else {
  fail("getGitBranch should detect main branch: " + JSON.stringify(r3));
}

// --- Test 2: CWD-based worktree detection ---
// Save original CWD and change to worktree
var origCwd = process.cwd();

// Test 2a: CWD in worktree, projectDir = main checkout — should find worktree branch
try {
  process.chdir(wtDir);
} catch(e) {
  fail("Could not chdir to worktree: " + e.message);
}

// When _git.branch is not set and CWD is a worktree inside projectDir,
// spec-gate should detect the worktree branch
var r4 = runGate(mainDir.replace(/\\/g, "/"), path.join(wtDir, "src", "app.js"), "");
if (!r4) {
  pass("CWD in worktree: detects feature branch, allows edit with unchecked T469");
} else if (r4.decision === "block" && r4.reason.indexOf("main branch") !== -1) {
  fail("CWD in worktree should detect feature branch, not main: " + r4.reason.substring(0, 100));
} else {
  fail("CWD in worktree unexpected result: " + JSON.stringify(r4).substring(0, 120));
}

// Test 2b: CWD in worktree, Bash cp command — should not be blocked as "on main"
var r5 = runBashGate(mainDir.replace(/\\/g, "/"), "cp foo bar", "");
if (!r5) {
  pass("CWD in worktree: Bash cp allowed (worktree branch detected)");
} else if (r5.decision === "block" && r5.reason.indexOf("main branch") !== -1) {
  fail("CWD in worktree: Bash cp blocked as 'on main' — " + r5.reason.substring(0, 100));
} else {
  fail("CWD in worktree: Bash cp unexpected: " + JSON.stringify(r5).substring(0, 120));
}

// Restore CWD
process.chdir(origCwd);

// --- Test 3: Branch preference — non-main beats main ---
// Test 3a: _git.branch takes priority (existing behavior)
var r6 = runGate(mainDir.replace(/\\/g, "/"), path.join(mainDir, "src", "app.js"), "worktree-T469-test");
if (!r6) {
  pass("_git.branch 'worktree-T469-test' takes priority: allowed");
} else {
  fail("_git.branch priority failed: " + JSON.stringify(r6).substring(0, 100));
}

// --- Test 4: CWD outside project dir should NOT be added as root ---
var outsideDir = path.join(TMPDIR, "outside-project");
fs.mkdirSync(outsideDir, { recursive: true });
// Create a fake worktree outside the project
var outsideGitDir = path.join(TMPDIR, "outside-gitdir");
fs.mkdirSync(outsideGitDir, { recursive: true });
fs.writeFileSync(path.join(outsideDir, ".git"), "gitdir: " + outsideGitDir.replace(/\\/g, "/") + "\n");
fs.writeFileSync(path.join(outsideGitDir, "HEAD"), "ref: refs/heads/feature-outside\n");
fs.writeFileSync(path.join(outsideDir, "TODO.md"), "- [ ] T999: Outside task\n");

try { process.chdir(outsideDir); } catch(e) {}
// CWD is outside projectDir — should NOT add as root, should still see main
var r7 = runGate(mainDir.replace(/\\/g, "/"), path.join(mainDir, "src", "app.js"), "");
if (r7 && r7.decision === "block" && r7.reason.indexOf("main branch") !== -1) {
  pass("CWD outside project dir: correctly ignored (still sees main)");
} else {
  fail("CWD outside project dir should be ignored: " + JSON.stringify(r7).substring(0, 120));
}
process.chdir(origCwd);

// --- Test 5: getGitBranch worktree file handling ---
// Directly test that getGitBranch can read a worktree's branch
// We test this indirectly by checking that CWD in worktree results in feature branch detection
// (Already covered by test 2a and 2b)

// Test 5: Relative gitdir path in .git file
var relWtDir = path.join(mainDir, ".claude", "worktrees", "T469-relative");
fs.mkdirSync(relWtDir, { recursive: true });
var relWtGitDir = path.join(gitDir, "worktrees", "T469-relative");
fs.mkdirSync(relWtGitDir, { recursive: true });
// Use relative path from worktree to gitdir
var relPath = path.relative(relWtDir, relWtGitDir).replace(/\\/g, "/");
fs.writeFileSync(path.join(relWtDir, ".git"), "gitdir: " + relPath + "\n");
fs.writeFileSync(path.join(relWtGitDir, "HEAD"), "ref: refs/heads/worktree-T469-relative\n");
fs.writeFileSync(path.join(relWtDir, "TODO.md"), "- [ ] T469: Relative test\n");
fs.mkdirSync(path.join(relWtDir, "src"), { recursive: true });
fs.writeFileSync(path.join(relWtDir, "src", "app.js"), "x");

try { process.chdir(relWtDir); } catch(e) {}
var r8 = runGate(mainDir.replace(/\\/g, "/"), path.join(relWtDir, "src", "app.js"), "");
if (!r8) {
  pass("Relative gitdir path in .git file: detects worktree branch");
} else if (r8.decision === "block" && r8.reason.indexOf("main branch") !== -1) {
  fail("Relative gitdir path: still saw main — " + r8.reason.substring(0, 100));
} else {
  fail("Relative gitdir path unexpected: " + JSON.stringify(r8).substring(0, 120));
}
process.chdir(origCwd);

// --- Test 6: T632 — worktree specs/ and TODO.md checked before main ---
// Create worktree with specs/ and TODO but main has NONE
var mainNoSpec = path.join(TMPDIR, "main-no-spec");
var mainNoSpecGit = path.join(mainNoSpec, ".git");
fs.mkdirSync(path.join(mainNoSpecGit, "refs", "heads"), { recursive: true });
fs.writeFileSync(path.join(mainNoSpecGit, "HEAD"), "ref: refs/heads/main\n");
fs.writeFileSync(path.join(mainNoSpec, "TODO.md"), "# nothing\n");
fs.mkdirSync(path.join(mainNoSpec, "src"), { recursive: true });
fs.writeFileSync(path.join(mainNoSpec, "src", "app.js"), "x");

var wt632 = path.join(mainNoSpec, ".claude", "worktrees", "feat-t632");
fs.mkdirSync(wt632, { recursive: true });
var wt632GitDir = path.join(mainNoSpecGit, "worktrees", "feat-t632");
fs.mkdirSync(wt632GitDir, { recursive: true });
fs.writeFileSync(path.join(wt632, ".git"), "gitdir: " + wt632GitDir.replace(/\\/g, "/") + "\n");
fs.writeFileSync(path.join(wt632GitDir, "HEAD"), "ref: refs/heads/feat-t632\n");
fs.writeFileSync(path.join(wt632, "TODO.md"), "- [ ] T632: Fix worktree spec detection\n");
fs.mkdirSync(path.join(wt632, "specs", "feat-t632"), { recursive: true });
fs.writeFileSync(path.join(wt632, "specs", "feat-t632", "spec.md"), "# T632 spec");
fs.writeFileSync(path.join(wt632, "specs", "feat-t632", "tasks.md"), "- [ ] T632: Worktree spec gate fix\n");
fs.mkdirSync(path.join(wt632, "src"), { recursive: true });
fs.writeFileSync(path.join(wt632, "src", "app.js"), "x");

try { process.chdir(wt632); } catch(e) {}
var r9 = runGate(mainNoSpec.replace(/\\/g, "/"), path.join(wt632, "src", "app.js"), "");
if (!r9) {
  pass("T632: worktree specs/ found when main has none — edit allowed");
} else {
  fail("T632: worktree specs/ not found: " + (r9.reason || "").substring(0, 100));
}
process.chdir(origCwd);

// --- Test 7: T633 — branch detected from worktree, not main ---
try { process.chdir(wt632); } catch(e) {}
var r10 = runGate(mainNoSpec.replace(/\\/g, "/"), path.join(wt632, "src", "app.js"), "");
if (!r10) {
  pass("T633: worktree branch detected (not 'main')");
} else if (r10.decision === "block" && r10.reason.indexOf("main branch") !== -1) {
  fail("T633: gate still sees 'main' instead of worktree branch");
} else {
  fail("T633: unexpected: " + (r10.reason || "").substring(0, 100));
}
process.chdir(origCwd);

// --- Test 8: T632 — worktree TODO.md has task, main does not ---
var wt632b = path.join(mainNoSpec, ".claude", "worktrees", "T632-todo");
fs.mkdirSync(wt632b, { recursive: true });
var wt632bGitDir = path.join(mainNoSpecGit, "worktrees", "T632-todo");
fs.mkdirSync(wt632bGitDir, { recursive: true });
fs.writeFileSync(path.join(wt632b, ".git"), "gitdir: " + wt632bGitDir.replace(/\\/g, "/") + "\n");
fs.writeFileSync(path.join(wt632bGitDir, "HEAD"), "ref: refs/heads/feat/T632-todo\n");
fs.writeFileSync(path.join(wt632b, "TODO.md"), "- [ ] T632: Task only in worktree\n");
fs.mkdirSync(path.join(wt632b, "specs", "T632-todo"), { recursive: true });
fs.writeFileSync(path.join(wt632b, "specs", "T632-todo", "spec.md"), "# spec");
fs.writeFileSync(path.join(wt632b, "specs", "T632-todo", "tasks.md"), "- [ ] T632: Worktree task\n");
fs.mkdirSync(path.join(wt632b, "src"), { recursive: true });
fs.writeFileSync(path.join(wt632b, "src", "app.js"), "x");

try { process.chdir(wt632b); } catch(e) {}
var r11 = runGate(mainNoSpec.replace(/\\/g, "/"), path.join(wt632b, "src", "app.js"), "");
if (!r11) {
  pass("T632: worktree TODO.md task found (main has none)");
} else {
  fail("T632: worktree TODO.md task not found: " + (r11.reason || "").substring(0, 100));
}
process.chdir(origCwd);

console.log("\n=== Results: " + PASS + " passed, " + FAIL + " failed ===");
process.exit(FAIL > 0 ? 1 : 0);
