#!/usr/bin/env node
/**
 * Test suite for spec-before-code-gate PreToolUse module.
 * Tests that file modifications require a spec (TODO entry or recent commit).
 */
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");

var pass = 0;
var fail = 0;

function ok(name, result) {
  if (result) {
    pass++;
    console.log("OK: " + name);
  } else {
    fail++;
    console.log("FAIL: " + name);
  }
}

var modulePath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "spec-before-code-gate.js");
var STATE_FILE = path.join(os.homedir(), ".claude", "hooks", ".spec-before-code-state");

// Save and restore state
var origState = null;
try { origState = fs.readFileSync(STATE_FILE, "utf-8"); } catch(e) {}
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;

// Create temp project dir with TODO.md
var tmpDir = path.join(os.tmpdir(), "spec-gate-test-" + process.pid);
fs.mkdirSync(tmpDir, { recursive: true });

function resetState(state) {
  try {
    if (state) {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    } else {
      try { fs.unlinkSync(STATE_FILE); } catch(e) {}
    }
  } catch(e) {}
}

function runGate(input) {
  delete require.cache[require.resolve(modulePath)];
  // Also clear the helper cache
  var helperPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "_file-modify-patterns.js");
  delete require.cache[require.resolve(helperPath)];
  var gate = require(modulePath);
  return gate(input);
}

function blocks(input) {
  var result = runGate(input);
  return result && result.decision === "block";
}

function passes(input) {
  return runGate(input) === null;
}

// === Non-file-modify tools should pass ===
resetState(null);
process.env.CLAUDE_PROJECT_DIR = tmpDir;

ok("Read tool: passes", passes({
  tool_name: "Read", tool_input: { file_path: "/tmp/test.js" }
}));

ok("Bash non-modify: passes (git status)", passes({
  tool_name: "Bash", tool_input: { command: "git status" }
}));

ok("Bash non-modify: passes (ls)", passes({
  tool_name: "Bash", tool_input: { command: "ls -la" }
}));

ok("Bash non-modify: passes (cat)", passes({
  tool_name: "Bash", tool_input: { command: "cat file.js" }
}));

// === Spec-related files are exempt ===
resetState(null);
ok("Edit TODO.md: exempt", passes({
  tool_name: "Edit", tool_input: { file_path: tmpDir + "/TODO.md", old_string: "a", new_string: "b" }
}));

ok("Write SESSION_STATE.md: exempt", passes({
  tool_name: "Write", tool_input: { file_path: tmpDir + "/SESSION_STATE.md", content: "test" }
}));

ok("Edit CLAUDE.md: exempt", passes({
  tool_name: "Edit", tool_input: { file_path: tmpDir + "/CLAUDE.md", old_string: "a", new_string: "b" }
}));

ok("Edit file in specs/: exempt", passes({
  tool_name: "Edit", tool_input: { file_path: tmpDir + "/specs/feature.md", old_string: "a", new_string: "b" }
}));

// === Git commit resets state ===
resetState({ lastCommitTs: 0, specChecked: true });
ok("git commit resets state", passes({
  tool_name: "Bash", tool_input: { command: 'git commit -m "test"' }
}));
// Verify state was reset
try {
  var state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  ok("state has lastCommitTs after commit", state.lastCommitTs > 0);
  ok("specChecked reset to false", state.specChecked === false);
} catch(e) {
  ok("state has lastCommitTs after commit", false);
  ok("specChecked reset to false", false);
}

// === specChecked=true passes through ===
resetState({ lastCommitTs: Date.now(), specChecked: true });
ok("specChecked=true: Edit passes", passes({
  tool_name: "Edit", tool_input: { file_path: tmpDir + "/src/app.js", old_string: "a", new_string: "b" }
}));

// === TODO.md with task marker = spec exists ===
resetState({ lastCommitTs: 0, specChecked: false });
fs.writeFileSync(path.join(tmpDir, "TODO.md"), "# TODO\n- [ ] T565: Add test coverage for gates\n");
ok("TODO.md with task: Edit passes", passes({
  tool_name: "Edit", tool_input: { file_path: tmpDir + "/src/app.js", old_string: "a", new_string: "b" }
}));

// === No spec = block ===
resetState({ lastCommitTs: 0, specChecked: false });
fs.writeFileSync(path.join(tmpDir, "TODO.md"), "# TODO\nNothing here\n");
ok("no spec: Edit blocks", blocks({
  tool_name: "Edit", tool_input: { file_path: tmpDir + "/src/app.js", old_string: "a", new_string: "b" }
}));

resetState({ lastCommitTs: 0, specChecked: false });
ok("no spec: Write blocks", blocks({
  tool_name: "Write", tool_input: { file_path: tmpDir + "/src/app.js", content: "test" }
}));

// === Bash file-modify patterns blocked without spec ===
resetState({ lastCommitTs: 0, specChecked: false });
ok("no spec: sed -i blocked", blocks({
  tool_name: "Bash", tool_input: { command: "sed -i 's/foo/bar/' file.js" }
}));

resetState({ lastCommitTs: 0, specChecked: false });
ok("no spec: cp blocked", blocks({
  tool_name: "Bash", tool_input: { command: "cp src/a.js src/b.js" }
}));

// === Block message quality ===
resetState({ lastCommitTs: 0, specChecked: false });
fs.writeFileSync(path.join(tmpDir, "TODO.md"), "# empty\n");
var blockResult = runGate({
  tool_name: "Edit", tool_input: { file_path: tmpDir + "/src/app.js", old_string: "a", new_string: "b" }
});
ok("block message mentions TODO.md", blockResult && blockResult.reason.indexOf("TODO.md") !== -1);
ok("block message mentions spec", blockResult && blockResult.reason.indexOf("spec") !== -1);

// === No CLAUDE_PROJECT_DIR = allow (can't check) ===
resetState({ lastCommitTs: 0, specChecked: false });
delete process.env.CLAUDE_PROJECT_DIR;
ok("no project dir: Edit passes", passes({
  tool_name: "Edit", tool_input: { file_path: "/tmp/src/app.js", old_string: "a", new_string: "b" }
}));

// === T631: Worktree awareness ===
// Create a "main project" with no spec and a worktree with a spec
var wtMainDir = path.join(tmpDir, "wt-main");
var wtMainGitDir = path.join(wtMainDir, ".git");
fs.mkdirSync(path.join(wtMainGitDir, "refs", "heads"), { recursive: true });
fs.writeFileSync(path.join(wtMainGitDir, "HEAD"), "ref: refs/heads/main\n");
fs.writeFileSync(path.join(wtMainDir, "TODO.md"), "# empty\n");

var wtDir = path.join(wtMainDir, ".claude", "worktrees", "feat-test");
fs.mkdirSync(wtDir, { recursive: true });
var wtGitDir = path.join(wtMainGitDir, "worktrees", "feat-test");
fs.mkdirSync(wtGitDir, { recursive: true });
fs.writeFileSync(path.join(wtDir, ".git"), "gitdir: " + wtGitDir.replace(/\\/g, "/") + "\n");
fs.writeFileSync(path.join(wtGitDir, "HEAD"), "ref: refs/heads/feat-test\n");
fs.writeFileSync(path.join(wtDir, "TODO.md"), "- [ ] T631: Fix worktree awareness\n");

var origCwd = process.cwd();

// Test: CWD in worktree, projectDir = main (no spec) → worktree TODO.md has spec
resetState({ lastCommitTs: 0, specChecked: false });
process.env.CLAUDE_PROJECT_DIR = wtMainDir;
try { process.chdir(wtDir); } catch(e) {}
ok("T631: worktree TODO.md found when main has no spec", passes({
  tool_name: "Edit", tool_input: { file_path: wtDir + "/src/app.js", old_string: "a", new_string: "b" }
}));

// Test: CWD in worktree with spec, main also has no spec — should still pass
resetState({ lastCommitTs: 0, specChecked: false });
ok("T631: worktree spec found on second edit too", passes({
  tool_name: "Write", tool_input: { file_path: wtDir + "/src/b.js", content: "x" }
}));

// Test: CWD NOT in worktree (normal git dir), main has no spec → should still block
process.chdir(origCwd);
resetState({ lastCommitTs: 0, specChecked: false });
process.env.CLAUDE_PROJECT_DIR = wtMainDir;
ok("T631: non-worktree CWD does not leak into check", blocks({
  tool_name: "Edit", tool_input: { file_path: wtMainDir + "/src/app.js", old_string: "a", new_string: "b" }
}));

process.chdir(origCwd);

// === Cleanup ===
process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
if (origState) {
  fs.writeFileSync(STATE_FILE, origState);
} else {
  try { fs.unlinkSync(STATE_FILE); } catch(e) {}
}
try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
