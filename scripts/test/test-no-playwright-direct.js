#!/usr/bin/env node
"use strict";
// Test suite for no-playwright-direct module (T541)

var path = require("path");
var MOD = path.join(__dirname, "../../modules/PreToolUse/no-playwright-direct.js");

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var gate = require(MOD);

console.log("=== hook-runner: no-playwright-direct (T541) ===");

// 1. Direct playwright tool blocked
var r1 = gate({ tool_name: "mcp__playwright__browser_click", tool_input: { selector: "#btn" } });
assert("mcp__playwright__browser_click blocked", r1 && r1.decision === "block");

// 2. Another playwright tool blocked
var r2 = gate({ tool_name: "mcp__playwright__browser_navigate", tool_input: { url: "https://example.com" } });
assert("mcp__playwright__browser_navigate blocked", r2 && r2.decision === "block");

// 3. browser_snapshot blocked
var r3 = gate({ tool_name: "mcp__playwright__browser_snapshot", tool_input: {} });
assert("mcp__playwright__browser_snapshot blocked", r3 && r3.decision === "block");

// 4. browser_fill_form blocked
var r4 = gate({ tool_name: "mcp__playwright__browser_fill_form", tool_input: {} });
assert("mcp__playwright__browser_fill_form blocked", r4 && r4.decision === "block");

// 5. Block reason mentions Blueprint
assert("block reason mentions Playwright/Blueprint", /Playwright|Blueprint|BLOCKED/i.test(r1.reason));

// 6. Block reason has WHY section
assert("block reason has WHY", /WHY:/.test(r2.reason));

// 7. Non-playwright MCP tool passes
var r7 = gate({ tool_name: "mcp__mcp-manager__mcpm", tool_input: {} });
assert("mcp-manager tool passes", r7 === null);

// 8. Regular tool passes
var r8 = gate({ tool_name: "Bash", tool_input: { command: "echo hello" } });
assert("Bash tool passes", r8 === null);

// 9. Read tool passes
var r9 = gate({ tool_name: "Read", tool_input: { file_path: "/tmp/foo.txt" } });
assert("Read tool passes", r9 === null);

// 10. Edit tool passes
var r10 = gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/foo.txt" } });
assert("Edit tool passes", r10 === null);

// 11. Empty tool_name passes
var r11 = gate({ tool_name: "", tool_input: {} });
assert("empty tool_name passes", r11 === null);

// 12. Missing tool_name passes
var r12 = gate({ tool_input: {} });
assert("missing tool_name passes", r12 === null);

// Summary
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
