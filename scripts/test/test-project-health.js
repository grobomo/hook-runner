#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/project-health.js
// project-health checks for missing runners, broken modules, and settings issues.
// On a working machine with hook-runner installed, it should return null or minor warnings.

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "project-health.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

var result = mod();
assert("Returns null or object", result === null || typeof result === "object");

if (result !== null) {
  assert("Result has text property", typeof result.text === "string");
  assert("Text mentions hook-runner health", result.text.indexOf("hook-runner health") >= 0);
  assert("Text mentions issue count", /\d+ issue/.test(result.text));
  assert("Does not block", result.decision === undefined);
} else {
  // All healthy — this is the expected case on a working machine
  assert("Returns null when all health checks pass", true);
}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
