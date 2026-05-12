#!/usr/bin/env node
// CI-SKIP — requires workflow-config.json state
"use strict";
// Tests for workflow-gate.js
// This module depends on workflow.js for state/step checks.
// We test: tool filtering, allowed path patterns, and behavior when workflow.js not found.
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/workflow-gate.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

// --- Tool filtering: only Edit/Write are gated ---
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Bash tool ignored", gate({tool_name: "Bash", tool_input: {command: "echo hi"}}) === null);
ok("Glob tool ignored", gate({tool_name: "Glob", tool_input: {}}) === null);
ok("Grep tool ignored", gate({tool_name: "Grep", tool_input: {}}) === null);

// --- Allowed path patterns always pass (even on Edit/Write) ---
var allowedPaths = [
  "/project/TODO.md",
  "/project/CLAUDE.md",
  "/project/SESSION_STATE.md",
  "/project/.claude/config.json",
  "/project/rules/my-rule.md",
  "/project/.github/workflows/ci.yml",
  "/project/.gitignore",
  "/project/archive/old-stuff.md",
  "/project/specs/001/SPEC.md",
  "/project/tests/test-foo.js",
  "/project/test/unit.js",
  "/project/config/settings.json",
  "/project/package.json",
  "/project/install.sh",
  "/project/setup.js",
  "/project/setup.py",
  "/project/workflows/my-wf.yml",
  "/project/.workflow-state/state.json",
];
for (var i = 0; i < allowedPaths.length; i++) {
  var p = allowedPaths[i];
  var basename = path.basename(p);
  ok("allowed: " + basename, gate({tool_name: "Edit", tool_input: {file_path: p}}) === null);
}

// --- Non-allowed paths with no workflow.js → pass (workflow not found = no gate) ---
// In test context, workflow.js may or may not be loadable. If not found, gate returns null.
var r = gate({tool_name: "Edit", tool_input: {file_path: "/project/src/app.js"}});
// If workflow.js is found and no active workflow, still null
// If workflow.js not found, null
ok("non-allowed path without active workflow passes", r === null);

// --- Write tool also uses allowed paths ---
ok("Write TODO.md allowed", gate({tool_name: "Write", tool_input: {file_path: "/project/TODO.md"}}) === null);
ok("Write spec allowed", gate({tool_name: "Write", tool_input: {file_path: "/project/specs/test.md"}}) === null);

// --- Empty file_path ---
ok("Edit empty path passes", gate({tool_name: "Edit", tool_input: {file_path: ""}}) === null);
ok("Edit no path passes", gate({tool_name: "Edit", tool_input: {}}) === null);

// --- path field variant ---
ok("path field works", gate({tool_name: "Edit", tool_input: {path: "/project/TODO.md"}}) === null);

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
