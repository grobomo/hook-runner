#!/usr/bin/env node
"use strict";
// Tests for gsd-branch-gate.js
var path = require("path");
var fs = require("fs");
var os = require("os");

var gate = require("../../modules/PreToolUse/gsd-branch-gate.js");

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

function makeInput(cmd) {
  return { tool_name: "Bash", tool_input: { command: cmd } };
}

// Set up a temp project with a ROADMAP.md
var tmpDir = path.join(os.tmpdir(), "gsd-branch-test-" + Date.now());
fs.mkdirSync(path.join(tmpDir, ".planning"), { recursive: true });
fs.writeFileSync(path.join(tmpDir, ".planning", "ROADMAP.md"),
  "# Roadmap\n\n## Active Milestone: Test\n\n### Phase 1: First\n- task\n\n### Phase 2: Second\n- task\n\n## Completed\n\n### Phase 0: Setup\n- done\n"
);

var origDir = process.env.CLAUDE_PROJECT_DIR;
process.env.CLAUDE_PROJECT_DIR = tmpDir;

// --- Tests ---

test("non-Bash tool passes", function() {
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.js" } });
  assert(r === null, "should pass");
});

test("non-checkout commands pass", function() {
  assert(gate(makeInput("git commit -m 'test'")) === null);
  assert(gate(makeInput("git push origin main")) === null);
  assert(gate(makeInput("echo hello")) === null);
});

test("valid GSD branch for active phase passes", function() {
  var r = gate(makeInput("git checkout -b 001-phase-1-replace-f5"));
  assert(r === null, "should pass for phase 1");
});

test("valid GSD branch for phase 2 passes", function() {
  var r = gate(makeInput("git checkout -b 042-phase-2-add-tests"));
  assert(r === null, "should pass for phase 2");
});

test("shtd-style task branch passes", function() {
  var r = gate(makeInput("git checkout -b 005-T001-setup-module"));
  assert(r === null, "shtd branches allowed");
});

test("invalid branch name blocks", function() {
  var r = gate(makeInput("git checkout -b my-cool-feature"));
  assert(r !== null, "should block");
  assert(r.decision === "block", "should be block decision");
  assert(r.reason.indexOf("GSD BRANCH GATE") !== -1, "should mention gate");
});

test("inactive phase blocks", function() {
  var r = gate(makeInput("git checkout -b 001-phase-5-nonexistent"));
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("not an active phase") !== -1, "should mention inactive");
  assert(r.reason.indexOf("Active phases: 1, 2") !== -1, "should list active phases");
});

test("phase 0 (completed) blocks", function() {
  var r = gate(makeInput("git checkout -b 001-phase-0-setup"));
  assert(r !== null, "should block completed phase");
  assert(r.reason.indexOf("not an active phase") !== -1);
});

test("no ROADMAP.md allows any GSD branch", function() {
  var noRoadmapDir = path.join(os.tmpdir(), "gsd-branch-test-empty-" + Date.now());
  fs.mkdirSync(noRoadmapDir, { recursive: true });
  process.env.CLAUDE_PROJECT_DIR = noRoadmapDir;

  var r = gate(makeInput("git checkout -b 001-phase-99-anything"));
  assert(r === null, "should pass when no roadmap");

  // But invalid format still blocks
  var r2 = gate(makeInput("git checkout -b random-branch"));
  assert(r2 !== null, "format still enforced");

  process.env.CLAUDE_PROJECT_DIR = tmpDir;
  fs.rmSync(noRoadmapDir, { recursive: true, force: true });
});

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origDir || "";
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
