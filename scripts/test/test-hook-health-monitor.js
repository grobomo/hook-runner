#!/usr/bin/env node
"use strict";
// T390: Tests for hook-health-monitor.js and run-hidden.js invocation logging
// Tests all 5 failure modes + happy path
var fs = require("fs");
var path = require("path");
var os = require("os");

var pass = 0, fail = 0;
function assert(ok, label) {
  if (ok) { pass++; console.log("OK: " + label); }
  else { fail++; console.log("FAIL: " + label); }
}

// Use a temp dir for test health log
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hook-health-test-"));
var healthLog = path.join(tmpDir, "hook-health.jsonl");

// ---- Test run-hidden.js logging ----

var runHiddenPath = path.join(__dirname, "../../run-hidden.js");
assert(fs.existsSync(runHiddenPath), "run-hidden.js exists");

var runHiddenSrc = fs.readFileSync(runHiddenPath, "utf-8");
assert(/hook-health\.jsonl/.test(runHiddenSrc), "run-hidden.js writes to hook-health.jsonl");
assert(/runner/.test(runHiddenSrc) && /exit/.test(runHiddenSrc), "run-hidden.js logs runner and exit code");
assert(/stdout/.test(runHiddenSrc) && /ms/.test(runHiddenSrc), "run-hidden.js logs stdout size and duration");
assert(/signal/.test(runHiddenSrc), "run-hidden.js logs signal");

// ---- Test hook-health-monitor.js module ----

var monitorPath = path.join(__dirname, "../../modules/PostToolUse/hook-health-monitor.js");
assert(fs.existsSync(monitorPath), "hook-health-monitor.js exists");

var mod = require(monitorPath);
assert(typeof mod === "function", "module exports a function");

var monitorSrc = fs.readFileSync(monitorPath, "utf-8");
assert(/\/\/\s*WHY:/.test(monitorSrc), "has WHY comment");
assert(/\/\/\s*WORKFLOW:/.test(monitorSrc), "has WORKFLOW comment");

// Test 1: Happy path — no warnings on clean log
fs.writeFileSync(healthLog, [
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 1, stdout: 80, stderr: 0, ms: 45, signal: null}),
  JSON.stringify({ts: new Date().toISOString(), runner: "run-posttooluse.js", exit: 0, stdout: 0, stderr: 0, ms: 30, signal: null})
].join("\n") + "\n");

var result = mod({tool_name: "Edit", _test_health_log: healthLog});
assert(result === null || result === undefined, "happy path: no warnings");

// Test 2: Crash detection — non-zero exit, no valid JSON on stdout
fs.writeFileSync(healthLog, [
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 1, stdout: 0, stderr: 150, ms: 10, signal: null})
].join("\n") + "\n");

result = mod({tool_name: "Edit", _test_health_log: healthLog});
assert(result !== null && result !== undefined, "crash detection: warns on non-zero exit with no stdout");

// Test 3: Exit code mismatch — block JSON written but exit 0
fs.writeFileSync(healthLog, [
  JSON.stringify({ts: new Date().toISOString(), runner: "run-stop.js", exit: 0, stdout: 80, stderr: 0, ms: 45, signal: null})
].join("\n") + "\n");

result = mod({tool_name: "Edit", _test_health_log: healthLog});
assert(result !== null && result !== undefined, "exit mismatch: warns on exit 0 with stdout (block ignored)");

// Test 4: Timeout/signal — runner was killed
fs.writeFileSync(healthLog, [
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: null, stdout: 0, stderr: 0, ms: 5000, signal: "SIGTERM"})
].join("\n") + "\n");

result = mod({tool_name: "Edit", _test_health_log: healthLog});
assert(result !== null && result !== undefined, "timeout: warns on signal kill");

// Test 5: Repeated crashes — same runner crashed 3+ times
fs.writeFileSync(healthLog, [
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 1, stdout: 0, stderr: 100, ms: 5, signal: null}),
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 1, stdout: 0, stderr: 100, ms: 5, signal: null}),
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 1, stdout: 0, stderr: 100, ms: 5, signal: null})
].join("\n") + "\n");

result = mod({tool_name: "Edit", _test_health_log: healthLog});
assert(result !== null && result !== undefined, "repeated crashes: warns on 3+ crashes from same runner");

// Cleanup
try { fs.unlinkSync(healthLog); fs.rmdirSync(tmpDir); } catch(e) {}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
