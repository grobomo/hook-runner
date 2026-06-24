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

check("Mentions alternatives/approaches", function() {
  var gate = loadGate();
  var r = gate({});
  assert(/approach|altern|attempt|strateg/i.test(r.reason));
});

check("Has WHY section", function() {
  var gate = loadGate();
  var r = gate({});
  assert(/WHY:/.test(r.reason));
});

check("Has NEXT STEPS", function() {
  var gate = loadGate();
  var r = gate({});
  assert(/NEXT STEPS:/i.test(r.reason));
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
