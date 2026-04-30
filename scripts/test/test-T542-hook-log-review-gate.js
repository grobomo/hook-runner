#!/usr/bin/env node
"use strict";
// T542: Tests for hook-log-review-gate module.
// Ensures Claude reviews hook-log.jsonl before creating/editing hook modules.

var fs = require("fs");
var path = require("path");
var os = require("os");

var modulePath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "hook-log-review-gate.js");
var mod = require(modulePath);
var passed = 0, failed = 0;

function pass(name) { console.log("  PASS: " + name); passed++; }
function fail(name) { console.log("  FAIL: " + name); failed++; }

// Clean up any stale flags from previous test runs
var flagDir = path.join(os.homedir(), ".claude", "hooks");
var reviewFlag = path.join(flagDir, ".hook-log-reviewed");
// Save and remove the flag temporarily for testing
var savedFlag = false;
try {
  var flagStat = fs.statSync(reviewFlag);
  savedFlag = true;
  fs.renameSync(reviewFlag, reviewFlag + ".test-save");
} catch (e) {}

console.log("=== hook-log-review-gate tests (T542) ===");

// 1. Non-module files pass through
var r = mod({ tool_name: "Edit", tool_input: { file_path: "/proj/src/app.js", old_string: "a", new_string: "b" } });
if (!r) pass("Non-module file passes through");
else fail("Non-module file should pass: " + JSON.stringify(r));

// 2. Module creation blocked without review
r = mod({ tool_name: "Write", tool_input: { file_path: "/proj/modules/PreToolUse/new-gate.js", content: "module.exports = function() {}" } });
if (r && r.decision === "block") pass("Module creation blocked without review");
else fail("Module creation should block: " + JSON.stringify(r));

// 3. Block message mentions hook-log.jsonl
if (r && r.reason && r.reason.indexOf("hook-log.jsonl") !== -1) pass("Block message mentions hook-log.jsonl");
else fail("Block message should mention hook-log.jsonl");

// 4. Module edit blocked without review
r = mod({ tool_name: "Edit", tool_input: { file_path: "/proj/modules/PostToolUse/some-check.js", old_string: "a", new_string: "b" } });
if (r && r.decision === "block") pass("Module edit blocked without review");
else fail("Module edit should block: " + JSON.stringify(r));

// 5. Helper files (underscore prefix) pass through
r = mod({ tool_name: "Write", tool_input: { file_path: "/proj/modules/PreToolUse/_bash-write-patterns.js", content: "x" } });
if (!r) pass("Helper file (_prefix) passes through");
else fail("Helper file should pass: " + JSON.stringify(r));

// 6. run-modules path also caught
var runModPath = path.join(os.homedir(), ".claude", "hooks", "run-modules", "PreToolUse", "spec-gate.js");
r = mod({ tool_name: "Edit", tool_input: { file_path: runModPath, old_string: "a", new_string: "b" } });
if (r && r.decision === "block") pass("run-modules path blocked without review");
else fail("run-modules path should block: " + JSON.stringify(r));

// 7. Non-Edit/Write tools pass through
r = mod({ tool_name: "Read", tool_input: { file_path: "/proj/modules/PreToolUse/gate.js" } });
if (!r) pass("Read tool passes through");
else fail("Read tool should pass: " + JSON.stringify(r));

// 8. After setting review flag, module creation allowed
try { fs.writeFileSync(reviewFlag, Date.now() + "\n"); } catch (e) {}
r = mod({ tool_name: "Write", tool_input: { file_path: "/proj/modules/PreToolUse/new-gate.js", content: "module.exports = function() {}" } });
if (!r) pass("Module creation allowed after review flag set");
else fail("Module creation should pass after review: " + JSON.stringify(r));

// 9. SessionStart modules also caught
try { fs.unlinkSync(reviewFlag); } catch (e) {}
r = mod({ tool_name: "Write", tool_input: { file_path: "/proj/modules/SessionStart/check.js", content: "x" } });
if (r && r.decision === "block") pass("SessionStart module blocked without review");
else fail("SessionStart module should block: " + JSON.stringify(r));

// 10. UserPromptSubmit modules also caught
r = mod({ tool_name: "Write", tool_input: { file_path: "/proj/modules/UserPromptSubmit/logger.js", content: "x" } });
if (r && r.decision === "block") pass("UserPromptSubmit module blocked without review");
else fail("UserPromptSubmit module should block: " + JSON.stringify(r));

// Cleanup — restore saved flag
try { fs.unlinkSync(reviewFlag); } catch (e) {}
if (savedFlag) {
  try { fs.renameSync(reviewFlag + ".test-save", reviewFlag); } catch (e) {}
}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
