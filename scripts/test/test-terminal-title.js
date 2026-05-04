#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/terminal-title.js
// terminal-title sets the terminal title via ANSI escape codes.
// Returns null when not connected to a TTY (which is the case in tests).

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "terminal-title.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

// In test/CI, stdout is piped (not a TTY)
assert("process.stdout.isTTY is falsy in test", !process.stdout.isTTY);

var result = mod();
assert("Returns null when not TTY", result === null);

var result2 = mod({ some: "input" });
assert("Returns null regardless of input", result2 === null);

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
