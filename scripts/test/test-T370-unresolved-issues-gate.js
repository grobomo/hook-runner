#!/usr/bin/env node
"use strict";
// Test suite for unresolved-issues-gate module (T370)

var path = require("path");
var fs = require("fs");
var os = require("os");
var MOD = path.join(__dirname, "../../modules/PreToolUse/unresolved-issues-gate.js");

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

// Create temp project dirs with various TODO.md states
var tmpBase = path.join(os.tmpdir(), "hook-runner-test-T370-" + Date.now());
fs.mkdirSync(tmpBase, { recursive: true });

function setupProject(name, todoContent) {
  var dir = path.join(tmpBase, name);
  fs.mkdirSync(dir, { recursive: true });
  if (todoContent !== null) {
    fs.writeFileSync(path.join(dir, "TODO.md"), todoContent, "utf-8");
  }
  return dir;
}

// Helper to run gate with a specific project dir
function runGate(projectDir, commitMsg) {
  var origDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = projectDir;

  // Clear module cache so it re-reads TODO.md
  delete require.cache[require.resolve(MOD)];
  var gate = require(MOD);

  var cmd = commitMsg
    ? 'git commit -m "' + commitMsg + '"'
    : 'git commit -m "Fix something specific here"';

  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  process.env.CLAUDE_PROJECT_DIR = origDir || "";
  return result;
}

console.log("=== hook-runner: unresolved-issues-gate (T370) ===");

// 1. Non-Bash passes
delete require.cache[require.resolve(MOD)];
var gate = require(MOD);
assert("non-Bash passes", gate({ tool_name: "Edit", tool_input: {} }) === null);

// 2. Non-commit bash passes
assert("non-commit passes", gate({ tool_name: "Bash", tool_input: { command: "echo hello" } }) === null);

// 3. Clean TODO.md passes
var cleanDir = setupProject("clean", "# TODO\n- [x] T1: Done task\n- [x] T2: Another done\n");
assert("clean TODO passes", runGate(cleanDir) === null);

// 4. No TODO.md passes
var noTodoDir = setupProject("no-todo", null);
assert("no TODO.md passes", runGate(noTodoDir) === null);

// 5. Unchecked task with FAIL blocks
var failDir = setupProject("has-fail", "# TODO\n- [ ] T99: FAIL in brain-bridge test suite\n");
var r5 = runGate(failDir);
assert("unchecked FAIL blocks", r5 && r5.decision === "block");

// 6. Unchecked task with timeout blocks
var timeoutDir = setupProject("has-timeout", "# TODO\n- [ ] T100: Fix timeout in deploy script\n");
var r6 = runGate(timeoutDir);
assert("unchecked timeout blocks", r6 && r6.decision === "block");

// 7. Unchecked task with MISMATCH blocks
var mismatchDir = setupProject("has-mismatch", "# TODO\n- [ ] T101: MISMATCH between live and repo\n");
var r7 = runGate(mismatchDir);
assert("unchecked MISMATCH blocks", r7 && r7.decision === "block");

// 8. Completed task with FAIL does NOT block (false positive protection)
var completedFailDir = setupProject("completed-fail", "# TODO\n- [x] T102: Fixed the FAIL in module test\n");
assert("completed FAIL task passes", runGate(completedFailDir) === null);

// 9. "0 failed" does NOT block (false positive)
var zeroFailDir = setupProject("zero-fail", "# TODO\n- 51 suites, 405 passed, 0 failed\n");
assert("0 failed passes (false positive)", runGate(zeroFailDir) === null);

// 10. Commit message with "known" acknowledges issues — passes
var knownDir = setupProject("known-issues", "# TODO\n- [ ] T103: FAIL in intermittent brain test\n");
var r10 = runGate(knownDir, "T103: Ship with known intermittent brain-bridge failure");
assert("known in commit message passes", r10 === null);

// 11. Commit message with "pre-existing" passes
var r11 = runGate(knownDir, "T104: Fix gate — pre-existing brain failure unchanged");
assert("pre-existing in commit message passes", r11 === null);

// 12. Block message includes line numbers
assert("block has line numbers", r5.reason.indexOf("L") !== -1);

// 13. Block message includes guidance
assert("block has resolution guidance", r5.reason.indexOf("Address") !== -1 || r5.reason.indexOf("fix") !== -1);

// 14. WARNING pattern blocks
var warnDir = setupProject("has-warn", "# TODO\n- [ ] T105: WARNING: disk space low during deploy\n");
var r14 = runGate(warnDir);
assert("unchecked WARNING blocks", r14 && r14.decision === "block");

// 15. ERROR pattern blocks
var errorDir = setupProject("has-error", "# TODO\n- [ ] T106: ERROR in health check output\n");
var r15 = runGate(errorDir);
assert("unchecked ERROR blocks", r15 && r15.decision === "block");

// 16. Plain bullet with issue word passes (not a task checkbox)
var bulletDir = setupProject("plain-bullet", "# Session Log\n- CI has pre-existing failures in T094\n- FAIL was fixed in commit abc123\n");
var r16 = runGate(bulletDir);
assert("plain bullet with FAIL passes (not a task)", r16 === null);

// 17. Session notes with crash/timeout pass
var notesDir = setupProject("session-notes", "# Notes\n- timeout increased to 360s per suite\n- crash in brain-bridge was intermittent\n");
var r17 = runGate(notesDir);
assert("session notes with issue words pass", r17 === null);

// Cleanup
try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch(e) {}

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
