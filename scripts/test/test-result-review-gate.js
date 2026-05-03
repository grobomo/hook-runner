#!/usr/bin/env node
"use strict";
// T581: Tests for result-review-gate.js (PostToolUse)
// Injects a review checklist when reading report/results files.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "result-review-gate.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

// --- Non-Read tool: passes ---

check("Non-Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
});

check("Write tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "/tmp/report.html" } }) === null);
});

// --- Non-report files: passes ---

check("Regular source file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "/src/index.js" } }) === null);
});

check("README.md: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "/project/README.md" } }) === null);
});

check("package.json: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "/project/package.json" } }) === null);
});

check("CHANGELOG.md: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "/project/CHANGELOG.md" } }) === null);
});

// --- Report filename patterns: blocks ---

check("file.report.html: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/hook-runner.report.html" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("REPORT FILE READ") !== -1);
});

check("report.json: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/report.json" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("test-results.xml: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/test-results.xml" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("test_results.txt: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/test_results.txt" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("coverage.html: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/out/coverage.html" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("summary.md: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/summary.md" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("health-check.log: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/health-check.log" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("health_check.txt: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/health_check.txt" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("file.pdf: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/analysis.pdf" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("result.csv: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/result.csv" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

// --- Directory-based detection: blocks ---

check("File in reports/ directory: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/project/reports/data.txt" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("File in report/ directory: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/project/report/output.json" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("File in results/ directory: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/project/results/test.xml" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Windows backslash path in reports dir: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "C:\\project\\reports\\data.txt" } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

// --- Checklist in reason ---

check("Reason includes checklist items", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/report.html" } });
  assert(r !== null);
  assert(r.reason.indexOf("FAIL") !== -1);
  assert(r.reason.indexOf("WARN") !== -1);
  assert(r.reason.indexOf("MISSING") !== -1);
});

check("Reason includes filename", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/my-report.html" } });
  assert(r !== null);
  assert(r.reason.indexOf("my-report.html") !== -1);
});

// --- Edge cases ---

check("Empty file_path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "" } }) === null);
});

check("Missing file_path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: {} }) === null);
});

check("String tool_input: parses correctly", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Read", tool_input: JSON.stringify({ file_path: "/tmp/report.html" }) });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read" }) === null);
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
