#!/usr/bin/env node
"use strict";
// Tests for modules/Stop/chat-export.js
// chat-export spawns a python script on session end. With HOOK_RUNNER_TEST, it returns null.

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "Stop", "chat-export.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

process.env.HOOK_RUNNER_TEST = "1";
var mod = require(MOD_PATH);

assert("Returns null in test mode", mod() === null);
assert("Returns null regardless of input", mod({ stop_hook_active: true }) === null);
assert("Is a function", typeof mod === "function");
assert("Returns null with empty object", mod({}) === null);

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
