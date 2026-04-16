#!/usr/bin/env node
"use strict";
// Tests for gsd-pr-gate.js
var path = require("path");
var fs = require("fs");
var os = require("os");

var gate = require("../../modules/PreToolUse/gsd-pr-gate.js");

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

function makeInput(cmd, branch) {
  return {
    tool_name: "Bash",
    tool_input: { command: cmd },
    _git: { branch: branch || "main" }
  };
}

// Set up a temp project with ROADMAP.md
var tmpDir = path.join(os.tmpdir(), "gsd-pr-test-" + Date.now());
fs.mkdirSync(path.join(tmpDir, ".planning"), { recursive: true });
fs.writeFileSync(path.join(tmpDir, ".planning", "ROADMAP.md"),
  "# Roadmap\n\n## Active Milestone: Test\n\n### Phase 1: First\n- task\n\n### Phase 2: Second\n- task\n"
);

var origDir = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = tmpDir;

// --- Tests ---

test("non-Bash tool passes", function() {
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.js" } });
  assert(r === null);
});

test("non-PR commands pass", function() {
  assert(gate(makeInput("git push origin main")) === null);
  assert(gate(makeInput("gh pr list")) === null);
  assert(gate(makeInput("gh pr view 123")) === null);
});

test("PR from active phase branch passes", function() {
  var r = gate(makeInput("gh pr create --title 'Phase 1: Add feature'", "001-phase-1-add-feature"));
  assert(r === null, "should pass for active phase branch");
});

test("PR from shtd task branch passes", function() {
  var r = gate(makeInput("gh pr create --title 'T001: Fix bug'", "005-T001-fix-bug"));
  assert(r === null, "shtd branches always allowed");
});

test("PR from inactive phase branch blocks", function() {
  var r = gate(makeInput("gh pr create --title 'Phase 5: New'", "001-phase-5-new-feature"));
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("not active") !== -1);
});

test("PR from non-GSD branch with phase in title passes", function() {
  var r = gate(makeInput("gh pr create --title 'Phase 1: Add feature'", "feature-branch"));
  assert(r === null, "title has phase reference");
});

test("PR from non-GSD branch with task ID in title passes", function() {
  var r = gate(makeInput("gh pr create --title 'T450: Add gate'", "random-branch"));
  assert(r === null, "title has task ID");
});

test("PR from non-GSD branch without phase reference blocks", function() {
  var r = gate(makeInput("gh pr create --title 'Add cool feature'", "random-branch"));
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("GSD PR GATE") !== -1);
});

test("PR without --title passes (interactive)", function() {
  var r = gate(makeInput("gh pr create", "random-branch"));
  assert(r === null, "no title = allow, Claude will prompt");
});

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origDir || "";
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
