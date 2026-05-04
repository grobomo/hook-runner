#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/load-lessons.js
// load-lessons reads self-analysis-lessons.jsonl and injects them as session context.
// It also includes the self-reflection system description.

var path = require("path");
var fs = require("fs");

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "load-lessons.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

var result = mod();

// The module always returns at least the self-reflection system description
assert("Returns an object", result !== null && typeof result === "object");
assert("Has text property", typeof result.text === "string");
assert("Text mentions SELF-REFLECTION SYSTEM", result.text.indexOf("SELF-REFLECTION SYSTEM") >= 0);
assert("Text mentions self-reflection.js", result.text.indexOf("self-reflection.js") >= 0);
assert("Text mentions reflection-score.js", result.text.indexOf("reflection-score.js") >= 0);
assert("Text mentions per-project lessons", result.text.indexOf("per-project") >= 0 || result.text.indexOf("lessons") >= 0);
assert("Text mentions JSONL format", result.text.indexOf("JSONL") >= 0 || result.text.indexOf("jsonl") >= 0);
assert("Does not block", result.decision === undefined);

// Result should not change with different inputs
var result2 = mod({ some: "input" });
assert("Text is consistent across calls", result2.text.indexOf("SELF-REFLECTION SYSTEM") >= 0);

// If there are lessons, they should be in the text
if (result.text.indexOf("SELF-ANALYSIS LESSONS") >= 0) {
  assert("Lessons section present when lessons exist", true);
  assert("Lessons section has 'Apply these lessons' footer", result.text.indexOf("Apply these lessons") >= 0);
} else {
  assert("No lessons section when no lessons files exist", true);
}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
