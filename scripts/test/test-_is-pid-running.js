#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/_is-pid-running.js
// Pure helper function — checks if a PID is running via process.kill(pid, 0).

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "_is-pid-running.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var isPidRunning = require(MOD_PATH);

assert("Is a function", typeof isPidRunning === "function");

// Current process should be running
assert("Current PID is running", isPidRunning(process.pid) === true);

// Parent PID should be running (we're a child of the shell)
assert("Parent PID is running", isPidRunning(process.ppid) === true);

// PID 1 may or may not exist on Windows — but shouldn't crash
var pid1 = isPidRunning(1);
assert("PID 1 returns boolean", typeof pid1 === "boolean");

// Invalid PIDs
assert("PID 0 returns false", isPidRunning(0) === false);
assert("Negative PID returns false", isPidRunning(-1) === false);
assert("NaN returns false", isPidRunning(NaN) === false);
assert("String returns false", isPidRunning("abc") === false);
assert("Null returns false", isPidRunning(null) === false);
assert("Undefined returns false", isPidRunning(undefined) === false);
assert("Float returns false", isPidRunning(1.5) === false);

// Very high PID (almost certainly not running)
assert("Very high PID returns false", isPidRunning(999999999) === false);

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
