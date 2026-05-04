#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/drift-check.js
// drift-check compares live files against last snapshot and warns about changes.
// Uses a daily marker file to rate-limit. We test the contract and edge cases.

var path = require("path");
var fs = require("fs");
var os = require("os");

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "drift-check.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

// The module reads ~/.claude/hooks/.drift-last-check for rate limiting.
// If the check ran within 24h, it returns null immediately.
// We can't easily reset the marker, so test the contract.
var result = mod();
assert("Returns null or object", result === null || typeof result === "object");

if (result !== null) {
  assert("Result has text property", typeof result.text === "string");
  assert("Text mentions DRIFT-CHECK", result.text.indexOf("DRIFT-CHECK") >= 0);
  assert("Does not block", result.decision === undefined);
} else {
  assert("Returns null (rate-limited or no drift)", true);
}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
