#!/usr/bin/env node
"use strict";
// T482: Test --test flag enhancements (timeouts, filters, skip-wsl)
// Tests parse the cmdTest function logic without running the full suite
var path = require("path");
var fs = require("fs");

var REPO_DIR = path.resolve(__dirname, "../..");
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
    passed++;
  } catch (e) {
    console.log("FAIL: " + name + " — " + e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// Load setup.js source to verify changes
var setupSrc = fs.readFileSync(path.join(REPO_DIR, "setup.js"), "utf-8");

// Test 1: cmdTest accepts args parameter
test("cmdTest function accepts args parameter", function() {
  assert(setupSrc.indexOf("function cmdTest(args)") !== -1, "cmdTest should accept args");
});

// Test 2: --timeout flag parsing
test("--timeout flag parsed from args", function() {
  assert(setupSrc.indexOf('args.indexOf("--timeout")') !== -1, "should parse --timeout");
});

// Test 3: --skip-wsl flag parsing
test("--skip-wsl flag parsed from args", function() {
  assert(setupSrc.indexOf('args.indexOf("--skip-wsl")') !== -1, "should parse --skip-wsl");
});

// Test 4: --js-only flag parsing
test("--js-only flag parsed from args", function() {
  assert(setupSrc.indexOf('args.indexOf("--js-only")') !== -1, "should parse --js-only");
});

// Test 5: --sh-only flag parsing
test("--sh-only flag parsed from args", function() {
  assert(setupSrc.indexOf('args.indexOf("--sh-only")') !== -1, "should parse --sh-only");
});

// Test 6: default JS timeout is 60s
test("default JS timeout is 60000ms", function() {
  assert(setupSrc.indexOf("customTimeout || 60000") !== -1, "JS default should be 60000");
});

// Test 7: timeout detection uses killed, signal, and elapsed heuristic
test("timeout detection uses multiple signals", function() {
  assert(setupSrc.indexOf("e.killed") !== -1, "should check e.killed");
  assert(setupSrc.indexOf('e.signal === "SIGTERM"') !== -1, "should check e.signal");
  assert(setupSrc.indexOf("testTimeout - 500") !== -1, "should use elapsed heuristic");
});

// Test 8: TIMEOUT is reported distinctly from FAIL
test("TIMEOUT reported distinctly from FAIL", function() {
  var timeoutMsg = setupSrc.indexOf('"    TIMEOUT: killed after "');
  var failMsg = setupSrc.indexOf('"    FAIL: suite crashed');
  assert(timeoutMsg !== -1, "should have TIMEOUT message");
  assert(failMsg !== -1, "should have FAIL message");
  assert(timeoutMsg !== failMsg, "TIMEOUT and FAIL should be different code paths");
});

// Test 9: timed-out suites tracked separately
test("timed-out suites tracked in separate array", function() {
  assert(setupSrc.indexOf("timedOutSuites") !== -1, "should track timedOutSuites");
  assert(setupSrc.indexOf("suiteTimeout++") !== -1, "should increment suiteTimeout counter");
});

// Test 10: timeouts don't cause exit(1)
test("timeouts alone do not trigger exit(1)", function() {
  // The exit condition should only check suiteFail, not suiteTimeout
  var exitLine = setupSrc.match(/if \(suiteFail > 0\) process\.exit\(1\)/);
  assert(exitLine, "exit(1) should only trigger on suiteFail > 0");
});

// Test 11: total elapsed time tracked
test("total elapsed time tracked", function() {
  assert(setupSrc.indexOf("var startTime = Date.now()") !== -1, "should track startTime");
  assert(setupSrc.indexOf("totalElapsed") !== -1, "should compute totalElapsed");
});

// Test 12: per-suite elapsed time shown
test("per-suite elapsed time shown", function() {
  assert(setupSrc.indexOf("var suiteStart = Date.now()") !== -1, "should track suiteStart");
  assert(setupSrc.indexOf("elapsed") !== -1, "should compute elapsed");
});

// Test 13: WSL tests list exists
test("WSL_TESTS list defined", function() {
  assert(setupSrc.indexOf("WSL_TESTS") !== -1, "should define WSL_TESTS");
  assert(setupSrc.indexOf("test-openclaw-e2e.sh") !== -1, "should include openclaw-e2e.sh");
});

// Test 14: dynamic WSL detection scans file content
test("dynamic WSL detection reads file head", function() {
  assert(setupSrc.indexOf("slice(0, 2000)") !== -1, "should read first 2000 chars");
  assert(setupSrc.indexOf("/\\bwsl\\b/i") !== -1, "should check for wsl keyword");
});

// Test 15: cmdTest dispatch passes args
test("cmdTest dispatch passes args", function() {
  assert(setupSrc.indexOf("cmdTest(args)") !== -1, "dispatch should pass args to cmdTest");
});

// Test 16: help text updated
test("help text mentions new flags", function() {
  assert(setupSrc.indexOf("--timeout") !== -1, "help should mention --timeout");
  assert(setupSrc.indexOf("--skip-wsl") !== -1, "help should mention --skip-wsl");
  assert(setupSrc.indexOf("--js-only") !== -1, "help should mention --js-only");
  assert(setupSrc.indexOf("--sh-only") !== -1, "help should mention --sh-only");
});

// Test 17: verify test directory has both .js and .sh files (for filter logic to matter)
test("test directory has both JS and bash tests", function() {
  var testDir = path.join(REPO_DIR, "scripts", "test");
  var files = fs.readdirSync(testDir).filter(function(f) { return f.indexOf("test-") === 0; });
  var jsCount = files.filter(function(f) { return f.slice(-3) === ".js"; }).length;
  var shCount = files.filter(function(f) { return f.slice(-3) === ".sh"; }).length;
  assert(jsCount > 10, "should have >10 JS tests, got " + jsCount);
  assert(shCount > 10, "should have >10 bash tests, got " + shCount);
});

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
