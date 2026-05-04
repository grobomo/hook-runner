#!/usr/bin/env node
"use strict";
// Tests for modules/Stop/self-reflection.js
// self-reflection is async (calls brain or claude -p). With HOOK_RUNNER_TEST, returns null.

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "Stop", "self-reflection.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

process.env.HOOK_RUNNER_TEST = "1";
var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

// Module is async — returns a Promise
var result = mod();
assert("Returns a Promise", result && typeof result.then === "function");

result.then(function(val) {
  assert("Resolves to null in test mode", val === null);

  return mod({ stop_hook_active: true });
}).then(function(val2) {
  assert("Resolves to null regardless of input", val2 === null);

  console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
  process.exit(failed > 0 ? 1 : 0);
}).catch(function(err) {
  console.log("FAIL: Promise rejected: " + err.message);
  failed++;
  console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
  process.exit(1);
});
