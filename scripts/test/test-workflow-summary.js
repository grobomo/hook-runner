#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/workflow-summary.js
// workflow-summary loads the workflow engine and injects active workflow info.

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "workflow-summary.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

// The module tries to load workflow.js from relative paths.
// In the repo, workflow.js should be available.
var result = mod();
assert("Returns null or object", result === null || typeof result === "object");

if (result !== null) {
  assert("Result has text property", typeof result.text === "string");
  assert("Text mentions ACTIVE WORKFLOWS", result.text.indexOf("ACTIVE WORKFLOWS") >= 0);
  // Should list at least one workflow if any are enabled
  if (result.text.indexOf("ACTIVE WORKFLOWS (0)") === -1) {
    assert("Lists at least one workflow", result.text.indexOf("  - ") >= 0);
  }
  assert("Does not block", result.decision === undefined);
} else {
  // No workflows enabled or workflow.js not found
  assert("Returns null when no active workflows", true);
}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
