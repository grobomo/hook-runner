#!/usr/bin/env node
"use strict";
// T584: Tests for never-give-up.js (Stop)
// Always blocks with reminder to try 3 approaches before declaring impossible.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "Stop", "never-give-up.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

check("Always blocks", function() {
  var gate = loadGate();
  var r = gate({});
  assert(r !== null, "should always block");
  assert(r.decision === "block");
});

check("Mentions 3 approaches", function() {
  var gate = loadGate();
  var r = gate({});
  assert(r.reason.indexOf("3 different approaches") !== -1);
});

check("Mentions WebSearch", function() {
  var gate = loadGate();
  var r = gate({});
  assert(r.reason.indexOf("WebSearch") !== -1);
});

check("Mentions exhausting options", function() {
  var gate = loadGate();
  var r = gate({});
  assert(r.reason.indexOf("exhausting options") !== -1);
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
