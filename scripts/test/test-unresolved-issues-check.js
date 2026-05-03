#!/usr/bin/env node
"use strict";
// T584: Tests for unresolved-issues-check.js (Stop)
// Blocks when TODO.md has stale progress markers or unresolved issues.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "Stop", "unresolved-issues-check.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var tmpDir = path.join(os.tmpdir(), "test-unresolved-issues-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function setProject(dir) {
  process.env.CLAUDE_PROJECT_DIR = dir;
}

function restoreProject() {
  if (origProjectDir !== undefined) process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  else delete process.env.CLAUDE_PROJECT_DIR;
}

function writeTodo(content) {
  fs.writeFileSync(path.join(tmpDir, "TODO.md"), content);
}

// --- No TODO.md: passes ---

check("No TODO.md: passes", function() {
  var emptyDir = path.join(tmpDir, "empty");
  fs.mkdirSync(emptyDir, { recursive: true });
  setProject(emptyDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r === null);
});

// --- Clean TODO.md: passes ---

check("All tasks completed: passes", function() {
  writeTodo("# TODO\n- [x] T100: Done task\n- [x] T101: Also done\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r === null);
});

check("Unchecked but no stale markers: passes", function() {
  writeTodo("# TODO\n- [ ] T200: Plan next sprint\n- [ ] T201: Review docs\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r === null);
});

// --- Stale progress markers: blocks ---

check("TESTING NOW marker: blocks", function() {
  writeTodo("# TODO\n- [ ] T300: TESTING NOW — verify login flow\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("TESTING NOW") !== -1);
});

check("IN PROGRESS marker: blocks", function() {
  writeTodo("# TODO\n- [ ] T301: IN PROGRESS — add feature\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
  assert(r.reason.indexOf("IN PROGRESS") !== -1);
});

check("INVESTIGATING marker: blocks", function() {
  writeTodo("# TODO\n- [ ] T302: INVESTIGATING memory leak\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
});

check("DEBUGGING marker: blocks", function() {
  writeTodo("# TODO\n- [ ] T303: DEBUGGING test failures\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
});

check("WIP marker: blocks", function() {
  writeTodo("# TODO\n- [ ] T304: WIP refactoring\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
});

check("Case insensitive: 'testing now' (lowercase): blocks", function() {
  writeTodo("# TODO\n- [ ] T305: testing now something\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
});

// --- Completed tasks with markers: passes ---

check("Completed task with TESTING NOW: passes", function() {
  writeTodo("# TODO\n- [x] T310: TESTING NOW — done actually\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r === null, "completed tasks should be skipped");
});

// --- Issue words: blocks ---

check("FAIL in unchecked task: blocks", function() {
  writeTodo("# TODO\n- [ ] T400: Fix FAIL in login test\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
  assert(r.reason.indexOf("FAIL") !== -1 || r.reason.indexOf("Unresolved") !== -1);
});

check("BROKEN in unchecked task: blocks", function() {
  writeTodo("# TODO\n- [ ] T401: BROKEN API endpoint\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
});

check("crashed in unchecked task: blocks", function() {
  writeTodo("# TODO\n- [ ] T402: App crashed on startup\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
});

// --- Issue words in gate/detector tasks: passes ---

check("FAIL in gate-related task: passes (exempted)", function() {
  writeTodo("# TODO\n- [ ] T410: Add tests for FAIL detector gate\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r === null, "gate/detector tasks should be exempted");
});

check("BROKEN in module check task: passes (exempted)", function() {
  writeTodo("# TODO\n- [ ] T411: Test BROKEN check module\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r === null);
});

// --- Multiple issues: all reported ---

check("Multiple stale items: blocks with list", function() {
  writeTodo("# TODO\n- [ ] T500: TESTING NOW first thing\n- [ ] T501: IN PROGRESS second thing\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null, "should block");
  assert(r.reason.indexOf("T500") !== -1);
  assert(r.reason.indexOf("T501") !== -1);
});

// --- Line numbers in output ---

check("Reports line numbers", function() {
  writeTodo("# TODO\n\n\n- [ ] T600: DEBUGGING issue\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r !== null);
  assert(r.reason.indexOf("L4") !== -1, "should report line 4");
});

// --- Edge cases ---

check("Non-task lines with markers: ignored", function() {
  writeTodo("# TODO\nWIP notes here\nDEBUGGING info\n");
  setProject(tmpDir);
  var gate = loadGate();
  var r = gate({});
  restoreProject();
  assert(r === null, "only unchecked task items should be checked");
});

// --- Cleanup ---
try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
restoreProject();

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
