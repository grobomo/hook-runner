#!/usr/bin/env node
"use strict";
// T584: Tests for test-before-done.js (Stop)
// Always blocks with reminder to run e2e tests.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "Stop", "test-before-done.js");
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

check("Mentions end-to-end testing", function() {
  var gate = loadGate();
  var r = gate({});
  assert(r.reason.indexOf("end-to-end") !== -1);
});

check("Has WHY + NEXT STEPS format", function() {
  var gate = loadGate();
  var r = gate({});
  assert(/WHY:/.test(r.reason) && /NEXT STEPS:/i.test(r.reason));
});

check("Returns same result regardless of input", function() {
  var gate = loadGate();
  var r1 = gate({});
  var r2 = gate({ tool_name: "Bash", tool_input: { command: "ls" } });
  assert(r1.reason === r2.reason, "should return same message");
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
