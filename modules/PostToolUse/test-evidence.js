// WORKFLOW: shtd, starter, gsd
// TOOLS: Bash
// WHY: Victory-declaration-gate blocked commits with words like "completed" even
// after tests were run and verified. The gate had no way to know tests passed —
// it just forced commit message rephrasing, which games the gate instead of
// validating. This module writes a state file when test results are detected,
// so victory-declaration-gate can verify actual test evidence before allowing.
"use strict";
var fs = require("fs");
var os = require("os");
var path = require("path");

// Where to write evidence (read by victory-declaration-gate)
var EVIDENCE_PATH = path.join(os.tmpdir(), ".hook-runner-test-evidence.json");

// Patterns that indicate test results with pass/fail counts
var TEST_PATTERNS = [
  // "N suites, M passed, K failed" (hook-runner full suite) — must be before generic
  /(\d+)\s+suites?,\s+(\d+)\s+passed,\s+(\d+)\s+failed/,
  // "Results: N passed, M failed"
  /Results:\s+(\d+)\s+passed,\s+(\d+)\s+failed/,
  // "N passed, M failed" (hook-runner, jest, vitest) — generic, last
  /(\d+)\s+passed,\s+(\d+)\s+failed/,
  // "Tests: N passed, M failed" (jest summary)
  /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/,
  // "PASS:" / "FAIL:" count pattern
  /PASS:\s.*\n[\s\S]*=== Results: (\d+) passed, (\d+) failed ===/,
];

// Extract pass/fail from a test pattern match
function extractResults(output) {
  for (var i = 0; i < TEST_PATTERNS.length; i++) {
    var m = output.match(TEST_PATTERNS[i]);
    if (!m) continue;
    // Patterns with 3 groups: suites, passed, failed
    if (m.length >= 4 && TEST_PATTERNS[i].source.indexOf("suites") !== -1) {
      return { passed: parseInt(m[2], 10), failed: parseInt(m[3], 10), suites: parseInt(m[1], 10) };
    }
    // Patterns with 2 groups: passed, failed
    return { passed: parseInt(m[1], 10), failed: parseInt(m[2], 10) };
  }
  return null;
}

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var output = (input.tool_result || "").toString();
  if (!output) return null;

  var results = extractResults(output);
  if (!results) return null;

  // Write evidence file
  var evidence = {
    ts: Date.now(),
    iso: new Date().toISOString(),
    passed: results.passed,
    failed: results.failed,
    suites: results.suites || 0,
    summary: results.passed + " passed, " + results.failed + " failed"
  };

  try {
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence));
  } catch (e) { /* best effort */ }

  return null; // never blocks — purely observational
};
