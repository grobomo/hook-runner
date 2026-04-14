#!/usr/bin/env node
"use strict";
// Test suite for result-review-gate module (T368)

var path = require("path");
var MOD = path.join(__dirname, "../../modules/PostToolUse/result-review-gate.js");

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var gate = require(MOD);

console.log("=== hook-runner: result-review-gate (T368) ===");

// 1. Non-Read tool passes
assert("non-Read passes", gate({ tool_name: "Bash", tool_input: {} }) === null);

// 2. Normal source file passes
assert("source file passes", gate({ tool_name: "Read", tool_input: { file_path: "/project/src/index.js" } }) === null);

// 3. TODO.md passes
assert("TODO.md passes", gate({ tool_name: "Read", tool_input: { file_path: "/project/TODO.md" } }) === null);

// 4. .report-data.json blocks
var r4 = gate({ tool_name: "Read", tool_input: { file_path: "/project/.report-data.json" } });
assert(".report-data.json blocks", r4 && r4.decision === "block");

// 5. test-results.html blocks
var r5 = gate({ tool_name: "Read", tool_input: { file_path: "/project/test-results.html" } });
assert("test-results.html blocks", r5 && r5.decision === "block");

// 6. PDF file blocks
var r6 = gate({ tool_name: "Read", tool_input: { file_path: "/project/output/analysis.pdf" } });
assert("PDF blocks", r6 && r6.decision === "block");

// 7. coverage.json blocks
var r7 = gate({ tool_name: "Read", tool_input: { file_path: "/project/coverage.json" } });
assert("coverage.json blocks", r7 && r7.decision === "block");

// 8. File in reports/ directory blocks
var r8 = gate({ tool_name: "Read", tool_input: { file_path: "/project/reports/deploy-log.txt" } });
assert("reports/ directory blocks", r8 && r8.decision === "block");

// 9. summary.md blocks
var r9 = gate({ tool_name: "Read", tool_input: { file_path: "/project/summary.md" } });
assert("summary.md blocks", r9 && r9.decision === "block");

// 10. health-check.log blocks
var r10 = gate({ tool_name: "Read", tool_input: { file_path: "/project/health-check.log" } });
assert("health-check.log blocks", r10 && r10.decision === "block");

// 11. Block message includes checklist
assert("block has checklist", r4.reason.indexOf("FAIL") !== -1 && r4.reason.indexOf("WARN") !== -1);

// 12. Block message includes filename
assert("block has filename", r4.reason.indexOf(".report-data.json") !== -1);

// 13. Normal config file passes
assert("config file passes", gate({ tool_name: "Read", tool_input: { file_path: "/project/tsconfig.json" } }) === null);

// 14. CHANGELOG passes
assert("CHANGELOG passes", gate({ tool_name: "Read", tool_input: { file_path: "/project/CHANGELOG.md" } }) === null);

// 15. Windows path with report blocks
var r15 = gate({ tool_name: "Read", tool_input: { file_path: "C:\\Users\\test\\project\\test-results.json" } });
assert("Windows path report blocks", r15 && r15.decision === "block");

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
