#!/usr/bin/env node
"use strict";
// T831: health-report-check — SessionStart infrastructure health monitor
var path = require("path");
var os = require("os");
var fs = require("fs");

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS: " + name); passed++; }
  catch (e) { console.log("  FAIL: " + name); console.log("    " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "health-report-check.js");
var HOME = os.homedir();
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");

function freshMod() {
  delete require.cache[require.resolve(MOD_PATH)];
  return require(MOD_PATH);
}

// Capture stderr
function captureStderr(fn) {
  var output = "";
  var orig = process.stderr.write;
  process.stderr.write = function(s) { output += s; };
  try { fn(); } finally { process.stderr.write = orig; }
  return output;
}

console.log("=== T831: health-report-check ===\n");

console.log("--- Module contract ---");

test("exports a function", function() {
  var mod = freshMod();
  assert(typeof mod === "function");
});

test("returns null (non-blocking)", function() {
  var mod = freshMod();
  var r = mod();
  assert(r === null, "should return null but got: " + JSON.stringify(r));
});

test("writes to stderr", function() {
  var mod = freshMod();
  var output = captureStderr(function() { mod(); });
  assert(output.indexOf("[HEALTH]") !== -1, "should contain [HEALTH]: " + output);
});

test("reports pass count and total", function() {
  var mod = freshMod();
  var output = captureStderr(function() { mod(); });
  assert(/\d+\/\d+/.test(output), "should have pass/total: " + output);
});

console.log("\n--- Source validation ---");

test("has WORKFLOW tag", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/\/\/ WORKFLOW:/.test(src));
});

test("has WHY comment", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/\/\/ WHY:/.test(src));
});

test("has INCIDENT HISTORY", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/INCIDENT HISTORY/.test(src));
});

test("logs to hook-log.jsonl", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/hook-log\.jsonl/.test(src));
});

test("has TOOLS tag", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/\/\/ TOOLS:/.test(src));
});

console.log("\n--- Check coverage ---");

var src = fs.readFileSync(MOD_PATH, "utf-8");

test("checks stop hook firing", function() {
  assert(/stop.*hook.*fir|Stop.*entries/i.test(src), "should check stop hook");
});

test("checks watchdog", function() {
  assert(/watchdog/i.test(src), "should check watchdog");
});

test("checks token proxy", function() {
  assert(/4100|token.*proxy|proxy.*health/i.test(src), "should check proxy");
});

test("checks module count", function() {
  assert(/module.*count|totalModules/i.test(src), "should check module count");
});

test("checks workflow config", function() {
  assert(/workflow.*config|workflow-config/i.test(src), "should check workflows");
});

test("checks settings.json hooks", function() {
  assert(/settings.*json.*hook|settings\.json/i.test(src), "should check settings");
});

test("checks recent errors", function() {
  assert(/error|crash/i.test(src), "should check errors");
});

test("checks corrections", function() {
  assert(/correction/i.test(src), "should check corrections");
});

test("checks reflection pending", function() {
  assert(/reflection.*pending|\.reflection-pending/i.test(src), "should check reflection");
});

console.log("\n--- Output format ---");

test("clean output for no issues", function() {
  // Can't guarantee no issues in real env, but verify format
  var mod = freshMod();
  var output = captureStderr(function() { mod(); });
  assert(/\[HEALTH\] \d+\/\d+/.test(output), "should match [HEALTH] N/M format: " + output);
});

test("issues listed with dash prefix", function() {
  var mod = freshMod();
  var output = captureStderr(function() { mod(); });
  if (output.indexOf("ISSUE") !== -1) {
    assert(/  - /.test(output), "issues should be dash-prefixed");
  }
  // If no issues, test passes trivially
  assert(true);
});

console.log("\n--- Performance ---");

test("completes in under 5 seconds", function() {
  var mod = freshMod();
  var start = Date.now();
  captureStderr(function() { mod(); });
  var elapsed = Date.now() - start;
  assert(elapsed < 5000, "took " + elapsed + "ms (budget: 5000ms)");
});

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);
