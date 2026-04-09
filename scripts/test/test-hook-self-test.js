#!/usr/bin/env node
"use strict";
// T388: Tests for hook-self-test.js SessionStart module
var path = require("path");
var pass = 0, fail = 0;

function assert(ok, label) {
  if (ok) { pass++; console.log("OK: " + label); }
  else { fail++; console.log("FAIL: " + label); }
}

// Test 1: module loads without error
var mod;
try {
  mod = require("../../modules/SessionStart/hook-self-test.js");
  assert(typeof mod === "function", "module exports a function");
} catch (e) {
  assert(false, "module loads: " + e.message);
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(1);
}

// Test 2: returns null (pass) — self-test is observational, never blocks
var result = mod({});
assert(result === null || result === undefined, "returns null (non-blocking)");

// Test 3: module has WHY and WORKFLOW comments
var fs = require("fs");
var src = fs.readFileSync(path.join(__dirname, "../../modules/SessionStart/hook-self-test.js"), "utf-8");
assert(/\/\/\s*WHY:/.test(src), "has WHY comment");
assert(/\/\/\s*WORKFLOW:/.test(src), "has WORKFLOW comment");

// Test 4: validates runner exit codes (check stderr output for diagnostics)
// The module should write diagnostic info to stderr
assert(/process\.stderr\.write|console\.error/.test(src), "writes diagnostics to stderr");

// Test 5: checks that runners exist
assert(/run-stop|run-pretooluse|run-posttooluse/.test(src), "checks runner files");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
