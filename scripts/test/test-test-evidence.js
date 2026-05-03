#!/usr/bin/env node
"use strict";
// T581: Tests for test-evidence.js (PostToolUse)
// Detects test results in Bash output and writes evidence file for victory-declaration-gate.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "test-evidence.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var EVIDENCE_PATH = path.join(os.tmpdir(), ".hook-runner-test-evidence.json");

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function cleanEvidence() {
  try { fs.unlinkSync(EVIDENCE_PATH); } catch(e) {}
}

// --- Non-applicable inputs ---

check("Non-Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: {}, tool_result: "5 passed, 0 failed" }) === null);
});

check("Empty tool_result: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "node test.js" }, tool_result: "" }) === null);
});

check("No test patterns in output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" }, tool_result: "file1.txt\nfile2.txt" }) === null);
});

// --- Always returns null (never blocks) ---

check("Never blocks even with test results", function() {
  cleanEvidence();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "node test.js" }, tool_result: "10 passed, 0 failed" });
  assert(r === null, "should always return null");
  cleanEvidence();
});

// --- Test pattern detection + evidence writing ---

check("Pattern: N passed, M failed", function() {
  cleanEvidence();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "node test.js" }, tool_result: "OK: test1\nOK: test2\n15 passed, 2 failed" });
  assert(fs.existsSync(EVIDENCE_PATH), "evidence file should exist");
  var ev = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf-8"));
  assert(ev.passed === 15, "passed should be 15, got " + ev.passed);
  assert(ev.failed === 2, "failed should be 2, got " + ev.failed);
  assert(ev.summary === "15 passed, 2 failed");
  cleanEvidence();
});

check("Pattern: N suites, M passed, K failed", function() {
  cleanEvidence();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "node setup.js --test" }, tool_result: "=== Results: 115 suites, 1785 passed, 0 failed ===" });
  var ev = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf-8"));
  assert(ev.passed === 1785, "passed should be 1785, got " + ev.passed);
  assert(ev.failed === 0, "failed should be 0, got " + ev.failed);
  assert(ev.suites === 115, "suites should be 115, got " + ev.suites);
  cleanEvidence();
});

check("Pattern: Results: N passed, M failed", function() {
  cleanEvidence();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "npm test" }, tool_result: "Results: 42 passed, 3 failed" });
  var ev = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf-8"));
  assert(ev.passed === 42);
  assert(ev.failed === 3);
  cleanEvidence();
});

check("Pattern: Tests: N passed, M failed (jest)", function() {
  cleanEvidence();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "npx jest" }, tool_result: "Tests: 88 passed, 1 failed" });
  var ev = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf-8"));
  assert(ev.passed === 88);
  assert(ev.failed === 1);
  cleanEvidence();
});

check("Evidence has timestamp", function() {
  cleanEvidence();
  var before = Date.now();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "test" }, tool_result: "5 passed, 0 failed" });
  var ev = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf-8"));
  assert(ev.ts >= before, "timestamp should be recent");
  assert(typeof ev.iso === "string" && ev.iso.length > 0, "iso should be set");
  cleanEvidence();
});

check("Evidence overwrites previous", function() {
  cleanEvidence();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "test" }, tool_result: "5 passed, 0 failed" });
  gate({ tool_name: "Bash", tool_input: { command: "test" }, tool_result: "20 passed, 1 failed" });
  var ev = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf-8"));
  assert(ev.passed === 20, "should be latest result");
  assert(ev.failed === 1);
  cleanEvidence();
});

// --- No match: no evidence file ---

check("Non-test output: no evidence written", function() {
  cleanEvidence();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "ls" }, tool_result: "just some output" });
  assert(!fs.existsSync(EVIDENCE_PATH), "evidence file should not exist");
});

// --- Edge cases ---

check("Suites default to 0 for non-suite pattern", function() {
  cleanEvidence();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "test" }, tool_result: "10 passed, 0 failed" });
  var ev = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf-8"));
  assert(ev.suites === 0, "suites should default to 0");
  cleanEvidence();
});

check("Missing tool_result: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "test" } }) === null);
});

check("Null tool_result: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "test" }, tool_result: null }) === null);
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
cleanEvidence();
process.exit(failed > 0 ? 1 : 0);
