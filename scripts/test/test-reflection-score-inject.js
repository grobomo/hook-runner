#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/reflection-score-inject.js
// reflection-score-inject loads reflection-score and injects its formatSummary into context.

var path = require("path");
var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "reflection-score-inject.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

// The module tries to load ../Stop/reflection-score which should be available
var result = mod();
assert("Returns a result (not null) when reflection-score is available", result !== null);

if (result) {
  // It should return a block decision with the score summary
  assert("Returns decision: block", result.decision === "block");
  assert("Returns reason string", typeof result.reason === "string");
  assert("Reason mentions REFLECTION SCORE", result.reason.indexOf("REFLECTION SCORE") >= 0);
  assert("Reason mentions a level", (function() {
    var levels = ["Novice", "Apprentice", "Journeyman", "Expert", "Master"];
    for (var i = 0; i < levels.length; i++) {
      if (result.reason.indexOf(levels[i]) >= 0) return true;
    }
    return false;
  })());
  assert("Reason mentions streak", result.reason.indexOf("Streak") >= 0 || result.reason.indexOf("streak") >= 0);
}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
