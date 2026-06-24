#!/usr/bin/env node
"use strict";
// T751: Tests for sibling-session-detect-gate.js
var path = require("path");
var fs = require("fs");
var os = require("os");

// Set test mode to prevent actual fleet queries
process.env.HOOK_RUNNER_TEST = "1";
var gate = require(path.join(__dirname, "../../modules/PreToolUse/sibling-session-detect-gate.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

// Gate returns null in test mode (HOOK_RUNNER_TEST=1)
ok("Returns null in test mode", gate({tool_name: "Bash", tool_input: {command: "ls"}}) === null);
ok("Returns null for Edit in test mode", gate({tool_name: "Edit", tool_input: {}}) === null);
ok("Returns null for Write in test mode", gate({tool_name: "Write", tool_input: {}}) === null);

// Module contract
ok("Exports a function", typeof gate === "function");
ok("Returns null or object", function() {
  var r = gate({tool_name: "Read", tool_input: {}});
  return r === null || (typeof r === "object" && r.decision);
}());

// Verify module has required metadata
var src = fs.readFileSync(path.join(__dirname, "../../modules/PreToolUse/sibling-session-detect-gate.js"), "utf-8");
ok("Has // WHY: comment", src.indexOf("// WHY:") >= 0);
ok("Has // TOOLS: comment", src.indexOf("// TOOLS:") >= 0);
ok("Has // WORKFLOW: comment", src.indexOf("// WORKFLOW:") >= 0);
ok("Has INCIDENT HISTORY", src.indexOf("INCIDENT HISTORY") >= 0);
ok("Has logging", src.indexOf("hook-log.jsonl") >= 0);
ok("Has description block", src.indexOf("SIBLING SESSION DETECT") >= 0);

// Verify key functions exist in source
ok("Has queryFleet function", src.indexOf("function queryFleet") >= 0);
ok("Has normalizeProjectPath", src.indexOf("function normalizeProjectPath") >= 0);
ok("Has CHECK_INTERVAL constant", src.indexOf("CHECK_INTERVAL") >= 0);
ok("Has COOLDOWN_MS constant", src.indexOf("COOLDOWN_MS") >= 0);
ok("Has state file management", src.indexOf("STATE_FILE") >= 0);

// Non-blocking: should never return a block decision
ok("Never blocks (returns null, not block)", function() {
  // Even if it detects siblings, it writes to stderr and returns null
  return src.indexOf("decision: \"block\"") === -1;
}());

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
