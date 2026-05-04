#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/session-cleanup.js
// session-cleanup sweeps orphaned .claude-* temp files from tmpdir.
// It always returns null (non-blocking).

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "session-cleanup.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

var result = mod();
assert("Returns null (non-blocking)", result === null);

var result2 = mod({});
assert("Returns null regardless of input", result2 === null);

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
