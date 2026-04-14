#!/usr/bin/env node
"use strict";
// Test suite for unresolved-issues-check Stop module (T372)

var path = require("path");
var fs = require("fs");
var os = require("os");
var MOD = path.join(__dirname, "../../modules/Stop/unresolved-issues-check.js");

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var tmpBase = path.join(os.tmpdir(), "hook-runner-test-T372-" + Date.now());
fs.mkdirSync(tmpBase, { recursive: true });

function setupProject(name, todoContent) {
  var dir = path.join(tmpBase, name);
  fs.mkdirSync(dir, { recursive: true });
  if (todoContent !== null) {
    fs.writeFileSync(path.join(dir, "TODO.md"), todoContent, "utf-8");
  }
  return dir;
}

function runGate(projectDir) {
  var origDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = projectDir;
  delete require.cache[require.resolve(MOD)];
  var gate = require(MOD);
  var result = gate({ session_id: "test" });
  process.env.CLAUDE_PROJECT_DIR = origDir || "";
  return result;
}

console.log("=== hook-runner: unresolved-issues-check (T372) ===");

// 1. Clean TODO passes
var cleanDir = setupProject("clean", "# TODO\n- [x] T1: Done\n- [x] T2: Done\n");
assert("clean TODO passes", runGate(cleanDir) === null);

// 2. No TODO passes
var noTodoDir = setupProject("no-todo", null);
assert("no TODO.md passes", runGate(noTodoDir) === null);

// 3. "TESTING NOW" stale marker blocks
var staleDir = setupProject("stale", "# TODO\n- [ ] T99: TESTING NOW — verify deploy\n");
var r3 = runGate(staleDir);
assert("TESTING NOW blocks", r3 && r3.decision === "block");

// 4. "IN PROGRESS" stale marker blocks
var progressDir = setupProject("progress", "# TODO\n- [ ] T100: IN PROGRESS — refactoring module\n");
var r4 = runGate(progressDir);
assert("IN PROGRESS blocks", r4 && r4.decision === "block");

// 5. "WIP" stale marker blocks
var wipDir = setupProject("wip", "# TODO\n- [ ] T101: WIP brain integration\n");
var r5 = runGate(wipDir);
assert("WIP blocks", r5 && r5.decision === "block");

// 6. Unchecked FAIL blocks
var failDir = setupProject("fail", "# TODO\n- [ ] T102: FAIL in brain-bridge suite\n");
var r6 = runGate(failDir);
assert("unchecked FAIL blocks", r6 && r6.decision === "block");

// 7. Completed tasks with stale markers pass
var completedDir = setupProject("completed", "# TODO\n- [x] T103: TESTING NOW (done)\n- [x] T104: IN PROGRESS (resolved)\n");
assert("completed stale markers pass", runGate(completedDir) === null);

// 8. Plain bullets (not tasks) pass
var bulletDir = setupProject("bullets", "# Log\n- FAIL was seen but fixed\n- crash in module resolved\n");
assert("plain bullets pass", runGate(bulletDir) === null);

// 9. Task describing a gate/detector passes (gate/detector keyword skip)
var gateDir = setupProject("gate-desc", "# TODO\n- [ ] T105: FAIL/error scan gate module\n");
assert("gate description with FAIL passes", runGate(gateDir) === null);

// 10. Block message includes line numbers
assert("stale block has line numbers", r3.reason.indexOf("L") !== -1);

// 11. Block message includes guidance
assert("block has update guidance", r3.reason.indexOf("Update TODO") !== -1);

// 12. INVESTIGATING blocks
var investDir = setupProject("investigating", "# TODO\n- [ ] T106: INVESTIGATING memory leak\n");
var r12 = runGate(investDir);
assert("INVESTIGATING blocks", r12 && r12.decision === "block");

// Cleanup
try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch(e) {}

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
