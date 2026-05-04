#!/usr/bin/env node
"use strict";
// Tests for modules/Stop/reflection-score.js
// reflection-score is a library module — the function returns null,
// but it exports utility methods: getLevel, POINTS, LEVELS, calculateDelta, etc.

var path = require("path");
var fs = require("fs");
var os = require("os");

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "Stop", "reflection-score.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

// --- Module contract ---
var mod = require(MOD_PATH);

assert("Module function returns null", mod() === null);
assert("Module function returns null regardless of input", mod({ stop_hook_active: true }) === null);
assert("Exports POINTS object", typeof mod.POINTS === "object" && mod.POINTS !== null);
assert("Exports LEVELS array", Array.isArray(mod.LEVELS) && mod.LEVELS.length > 0);
assert("Exports REFLECTION_INTERVALS object", typeof mod.REFLECTION_INTERVALS === "object");
assert("Exports getLevel function", typeof mod.getLevel === "function");
assert("Exports readScore function", typeof mod.readScore === "function");
assert("Exports writeScore function", typeof mod.writeScore === "function");
assert("Exports updateScore function", typeof mod.updateScore === "function");
assert("Exports formatSummary function", typeof mod.formatSummary === "function");
assert("Exports SCORE_PATH string", typeof mod.SCORE_PATH === "string");

// --- POINTS constants ---
assert("CLEAN_REFLECTION is positive", mod.POINTS.CLEAN_REFLECTION > 0);
assert("STREAK_BONUS is positive", mod.POINTS.STREAK_BONUS > 0);
assert("WORKFLOW_VIOLATION is negative", mod.POINTS.WORKFLOW_VIOLATION < 0);
assert("USER_CORRECTION is negative", mod.POINTS.USER_CORRECTION < 0);
assert("FRUSTRATION_DETECTED is negative", mod.POINTS.FRUSTRATION_DETECTED < 0);
assert("RAPID_INTERRUPT_CLUSTER is most negative", mod.POINTS.RAPID_INTERRUPT_CLUSTER <= mod.POINTS.FRUSTRATION_DETECTED);

// --- LEVELS ---
assert("LEVELS sorted by min ascending", (function() {
  for (var i = 1; i < mod.LEVELS.length; i++) {
    if (mod.LEVELS[i].min <= mod.LEVELS[i-1].min) return false;
  }
  return true;
})());
assert("First level starts at 0", mod.LEVELS[0].min === 0);
assert("First level is Novice", mod.LEVELS[0].name === "Novice");
assert("Last level is Master", mod.LEVELS[mod.LEVELS.length - 1].name === "Master");

// --- getLevel ---
assert("getLevel(0) is Novice", mod.getLevel(0).name === "Novice");
assert("getLevel(49) is Novice", mod.getLevel(49).name === "Novice");
assert("getLevel(50) is Apprentice", mod.getLevel(50).name === "Apprentice");
assert("getLevel(149) is Apprentice", mod.getLevel(149).name === "Apprentice");
assert("getLevel(150) is Journeyman", mod.getLevel(150).name === "Journeyman");
assert("getLevel(300) is Expert", mod.getLevel(300).name === "Expert");
assert("getLevel(500) is Master", mod.getLevel(500).name === "Master");
assert("getLevel(9999) is Master", mod.getLevel(9999).name === "Master");

// --- REFLECTION_INTERVALS ---
assert("Novice interval is shortest", mod.REFLECTION_INTERVALS["Novice"] < mod.REFLECTION_INTERVALS["Apprentice"]);
assert("Master interval is longest", mod.REFLECTION_INTERVALS["Master"] > mod.REFLECTION_INTERVALS["Expert"]);
assert("All levels have intervals", (function() {
  for (var i = 0; i < mod.LEVELS.length; i++) {
    if (!mod.REFLECTION_INTERVALS[mod.LEVELS[i].name]) return false;
  }
  return true;
})());

// --- readScore with no file ---
// readScore reads from SCORE_PATH which is in ~/.claude/hooks/.
// We test the default shape by temporarily pointing to a non-existent path.
// Actually, we can test the structure of what readScore returns in error case
// by checking the module code — it returns a default object.
// Since we can't easily mock the path, test that readScore returns an object.
assert("readScore returns object", typeof mod.readScore() === "object");
assert("readScore has total field", typeof mod.readScore().total === "number");
assert("readScore has level field", typeof mod.readScore().level === "string");
assert("readScore has streak field", typeof mod.readScore().streak === "number");
assert("readScore has history array", Array.isArray(mod.readScore().history));

// --- formatSummary ---
assert("formatSummary returns string", typeof mod.formatSummary() === "string");
assert("formatSummary contains REFLECTION SCORE", mod.formatSummary().indexOf("REFLECTION SCORE") >= 0);
assert("formatSummary contains level name", (function() {
  var summary = mod.formatSummary();
  // Should contain one of the level names
  for (var i = 0; i < mod.LEVELS.length; i++) {
    if (summary.indexOf(mod.LEVELS[i].name) >= 0) return true;
  }
  return false;
})());

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
