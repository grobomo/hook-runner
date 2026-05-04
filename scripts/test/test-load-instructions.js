#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/load-instructions.js
// load-instructions always returns a text object with session start instructions.

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "load-instructions.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

var result = mod();
assert("Returns an object", result !== null && typeof result === "object");
assert("Returns text property", typeof result.text === "string");
assert("Text mentions TODO.md", result.text.indexOf("TODO.md") >= 0);
assert("Text mentions CLAUDE_PROJECT_DIR", result.text.indexOf("CLAUDE_PROJECT_DIR") >= 0);
assert("Text mentions session handoff", result.text.indexOf("session handoff") >= 0 || result.text.indexOf("Session") >= 0);
assert("Does not block", result.decision === undefined);

var result2 = mod({ some: "input" });
assert("Returns same result regardless of input", result2.text === result.text);

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
