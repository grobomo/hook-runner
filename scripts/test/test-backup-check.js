#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/backup-check.js
// backup-check is async. It reads ~/.claude/backups/ and warns about stale backups.

var path = require("path");
var fs = require("fs");
var os = require("os");

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "backup-check.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

// Module is async
var result = mod();
assert("Returns a Promise", result && typeof result.then === "function");

// The module reads ~/.claude/backups/ which exists (or doesn't) on this machine.
// We can't easily mock HOME, so we test the contract: returns object or null.
result.then(function(val) {
  assert("Returns null or object", val === null || typeof val === "object");
  if (val !== null) {
    assert("Result has text property", typeof val.text === "string");
    assert("Text is informational (no block)", val.decision === undefined);
  }

  console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
  process.exit(failed > 0 ? 1 : 0);
}).catch(function(err) {
  console.log("FAIL: Promise rejected: " + err.message);
  process.exit(1);
});
