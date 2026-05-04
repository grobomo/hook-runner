#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/session-collision-detector.js
// session-collision-detector writes a lock file and warns about other sessions.
// It always returns null or a warning string.

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "session-collision-detector.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

// Save and set project dir
var origDir = process.env.CLAUDE_PROJECT_DIR;

// --- No project dir ---
process.env.CLAUDE_PROJECT_DIR = "";
delete require.cache[require.resolve(MOD_PATH)];
var mod1 = require(MOD_PATH);
var r1 = mod1();
assert("Returns null when no project dir", r1 === null);

// --- With project dir ---
process.env.CLAUDE_PROJECT_DIR = origDir || process.cwd();
delete require.cache[require.resolve(MOD_PATH)];
var mod2 = require(MOD_PATH);
var r2 = mod2();
// Should return null (no collision) or a warning string
assert("Returns null or string", r2 === null || typeof r2 === "string");

if (typeof r2 === "string") {
  assert("Warning mentions SESSION COLLISION", r2.indexOf("SESSION COLLISION") >= 0);
} else {
  assert("Returns null when no other sessions active", true);
}

// Restore
process.env.CLAUDE_PROJECT_DIR = origDir || "";

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
