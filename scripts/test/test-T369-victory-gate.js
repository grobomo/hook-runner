#!/usr/bin/env node
"use strict";
// Test suite for victory-declaration-gate module (T369)

var path = require("path");
var MOD = path.join(__dirname, "../../modules/PreToolUse/victory-declaration-gate.js");

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var gate = require(MOD);

console.log("=== hook-runner: victory-declaration-gate (T369) ===");

// 1. Non-Bash tool passes
assert("non-Bash passes", gate({ tool_name: "Edit", tool_input: {} }) === null);

// 2. Non-commit bash passes
assert("non-commit bash passes", gate({ tool_name: "Bash", tool_input: { command: "echo hello" } }) === null);

// 3. Specific commit message passes
var r3 = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "T442: Fix testbox gate — 17/17 tests pass, synced to live"' } });
assert("specific message with count passes", r3 === null);

// 4. "All tests pass" blocks
var r4 = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "All tests pass"' } });
assert("all tests pass blocks", r4 && r4.decision === "block");

// 5. "all green" blocks
var r5 = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "Everything is all green now"' } });
assert("all green blocks", r5 && r5.decision === "block");

// 6. "completed successfully" blocks
var r6 = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "Task completed successfully"' } });
assert("completed successfully blocks", r6 && r6.decision === "block");

// 7. "100%" blocks
var r7 = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "100% coverage achieved"' } });
assert("100% blocks", r7 && r7.decision === "block");

// 8. "zero failures" blocks
var r8 = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "Deploy with zero failures"' } });
assert("zero failures blocks", r8 && r8.decision === "block");

// 9. Normal descriptive message passes
var r9 = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "T370: Add unresolved-issues-gate module with 12 test cases"' } });
assert("normal descriptive message passes", r9 === null);

// 10. "succeeded" blocks
var r10 = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "Deploy succeeded"' } });
assert("succeeded blocks", r10 && r10.decision === "block");

// 11. Heredoc message with victory words blocks
var heredocCmd = 'git commit -m "$(cat <<\'EOF\'\nAll tests passed and everything works\nEOF\n)"';
var r11 = gate({ tool_name: "Bash", tool_input: { command: heredocCmd } });
assert("heredoc victory blocks", r11 && r11.decision === "block");

// 12. Block message includes guidance
assert("block has verification checklist", r4.reason.indexOf("verify") !== -1 || r4.reason.indexOf("VERIFY") !== -1 || r4.reason.indexOf("Verify") !== -1);
assert("block has rephrase guidance", r4.reason.indexOf("Rephrase") !== -1 || r4.reason.indexOf("GOOD") !== -1);

// 14. Victory words in body (not title) should pass — body may describe/quote them
var bodyCmd = 'git commit -m "$(cat <<\'EOF\'\nT369: Add victory-declaration gate\n\nBlocks messages like all tests pass or all green in the title line.\nEOF\n)"';
var r14 = gate({ tool_name: "Bash", tool_input: { command: bodyCmd } });
assert("victory words in body only passes", r14 === null);

// 15. Victory words in title of heredoc still blocks
var titleVictoryCmd = 'git commit -m "$(cat <<\'EOF\'\nAll tests pass — ship it\n\nDetails here.\nEOF\n)"';
var r15 = gate({ tool_name: "Bash", tool_input: { command: titleVictoryCmd } });
assert("victory words in heredoc title blocks", r15 && r15.decision === "block");

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
