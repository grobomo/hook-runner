#!/usr/bin/env node
"use strict";
// T569: Tests for task-completion-gate.js
// Blocks marking tasks [x] in TODO.md/tasks.md without PR reference.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "task-completion-gate.js");
var gate = require(modPath);
var passed = 0, failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
    passed++;
  } catch (e) {
    console.log("FAIL: " + name + " — " + e.message);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function makeInput(file, oldStr, newStr) {
  return {
    tool_name: "Edit",
    tool_input: { file_path: file, old_string: oldStr, new_string: newStr }
  };
}

// --- Tests ---

check("Non-Edit tool: passes", function() {
  var r = gate({ tool_name: "Bash", tool_input: { command: "echo hi" } });
  assert(r === null);
});

check("Edit non-TODO file: passes", function() {
  var r = gate(makeInput("/project/src/app.js",
    "- [ ] T001: Do thing",
    "- [x] T001: Do thing"));
  assert(r === null, "non-TODO file should pass");
});

check("Edit TODO.md: marking [x] with PR ref: passes", function() {
  var r = gate(makeInput("/project/TODO.md",
    "- [ ] T001: Add feature",
    "- [x] T001: Add feature (PR #42)"));
  assert(r === null, "should pass with PR ref");
});

check("Edit TODO.md: marking [x] without PR ref: blocks", function() {
  var r = gate(makeInput("/project/TODO.md",
    "- [ ] T001: Add feature",
    "- [x] T001: Add feature"));
  assert(r !== null, "should block");
  assert(r.decision === "block", "decision should be block");
  assert(r.reason.indexOf("TASK COMPLETION GATE") !== -1, "should mention gate");
  assert(r.reason.indexOf("PR") !== -1, "should mention PR");
});

check("Edit tasks.md: same enforcement", function() {
  var r = gate(makeInput("/project/specs/feature/tasks.md",
    "- [ ] T005: Implement handler",
    "- [x] T005: Implement handler"));
  assert(r !== null, "should block without PR");
  assert(r.decision === "block");
});

check("Already checked [x] in old: passes (not newly completing)", function() {
  var r = gate(makeInput("/project/TODO.md",
    "- [x] T001: Old task (PR #10)",
    "- [x] T001: Old task (PR #10) — updated desc"));
  assert(r === null, "already checked should pass");
});

check("Line without task ID: passes", function() {
  var r = gate(makeInput("/project/TODO.md",
    "- [ ] Fix that bug",
    "- [x] Fix that bug"));
  assert(r === null, "no T### should pass");
});

check("Multiple tasks: blocks only missing PR", function() {
  var old = "- [ ] T001: First\n- [ ] T002: Second";
  var new_ = "- [x] T001: First (PR #5)\n- [x] T002: Second";
  var r = gate(makeInput("/project/TODO.md", old, new_));
  assert(r !== null, "should block");
  assert(r.reason.indexOf("T002") !== -1, "should mention T002");
  // T001 has PR so shouldn't be in the block message
});

check("Adding new [x] line (not from [ ]): passes", function() {
  var r = gate(makeInput("/project/TODO.md",
    "## Tasks",
    "## Tasks\n- [x] T099: New entry (PR #77)"));
  assert(r === null, "new line not from [ ] should pass");
});

check("PR #N with various formats: passes", function() {
  var formats = ["(PR #42)", "(PR#42)", "PR #42", "(pr #42)"];
  for (var i = 0; i < formats.length; i++) {
    var r = gate(makeInput("/project/TODO.md",
      "- [ ] T001: Task",
      "- [x] T001: Task " + formats[i]));
    assert(r === null, "format '" + formats[i] + "' should pass");
  }
});

check("case-insensitive TODO.md match", function() {
  var r = gate(makeInput("/project/todo.md",
    "- [ ] T001: task",
    "- [x] T001: task"));
  assert(r !== null, "should still block on lowercase todo.md");
});

check("Windows path: works", function() {
  var r = gate(makeInput("C:\\Users\\user\\project\\TODO.md",
    "- [ ] T001: Fix",
    "- [x] T001: Fix"));
  assert(r !== null, "should block on Windows path");
});

check("Empty tool_input: passes gracefully", function() {
  var r = gate({ tool_name: "Edit", tool_input: {} });
  assert(r === null, "empty input should pass");
});

check("No old_string or new_string: passes", function() {
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/TODO.md" } });
  assert(r === null, "missing strings should pass");
});

check("Multiline with mixed completions: blocks only new without PR", function() {
  var old = "- [x] T001: Done (PR #1)\n- [ ] T002: Pending\n- [ ] T003: Also pending";
  var new_ = "- [x] T001: Done (PR #1)\n- [x] T002: Pending (PR #5)\n- [x] T003: Also pending";
  var r = gate(makeInput("/project/TODO.md", old, new_));
  assert(r !== null, "should block");
  assert(r.reason.indexOf("T003") !== -1, "should mention T003");
  assert(r.reason.indexOf("T001") === -1, "should not mention T001 (already done)");
  assert(r.reason.indexOf("T002") === -1, "should not mention T002 (has PR)");
});

// Summary
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
