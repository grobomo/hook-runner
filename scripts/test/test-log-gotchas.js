#!/usr/bin/env node
"use strict";
// T584: Tests for log-gotchas.js (Stop)
// Always blocks with reminder to capture gotchas as rule files.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "Stop", "log-gotchas.js");
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

check("Mentions rule files", function() {
  var gate = loadGate();
  var r = gate({});
  assert(r.reason.indexOf("rule file") !== -1);
});

check("Mentions .claude/rules/", function() {
  var gate = loadGate();
  var r = gate({});
  assert(r.reason.indexOf(".claude/rules/") !== -1);
});

check("Mentions 20-line limit", function() {
  var gate = loadGate();
  var r = gate({});
  assert(r.reason.indexOf("20 lines") !== -1);
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
