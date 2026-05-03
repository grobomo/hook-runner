#!/usr/bin/env node
"use strict";
// T585: Tests for auto-continue.js (Stop)
// Blocks stop with "keep working" message unless preserved-tab-idle flag is set.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "Stop", "auto-continue.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var home = process.env.HOME || process.env.USERPROFILE || "";
var IDLE_FLAG = path.join(home, ".claude", ".preserved-tab-idle");

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function cleanIdleFlag() {
  try { fs.unlinkSync(IDLE_FLAG); } catch(e) {}
}

// --- Normal operation: always blocks ---

check("Blocks by default (no idle flag)", function() {
  cleanIdleFlag();
  var gate = loadGate();
  var r = gate({});
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Block reason is non-empty", function() {
  cleanIdleFlag();
  var gate = loadGate();
  var r = gate({});
  assert(r.reason.length > 0, "reason should not be empty");
});

check("Block reason comes from stop-message.txt", function() {
  cleanIdleFlag();
  var gate = loadGate();
  var r = gate({});
  // The message file exists in the module directory
  var msgPath = path.join(__dirname, "..", "..", "modules", "Stop", "stop-message.txt");
  if (fs.existsSync(msgPath)) {
    var expected = fs.readFileSync(msgPath, "utf-8").trim();
    assert(r.reason === expected, "reason should match stop-message.txt content");
  } else {
    // Fallback message when file doesn't exist
    assert(r.reason.indexOf("TODO.md") !== -1, "fallback should mention TODO.md");
  }
});

// --- Preserved-tab-idle flag: passes ---

check("With idle flag: returns null (allows stop)", function() {
  cleanIdleFlag();
  var dir = path.dirname(IDLE_FLAG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(IDLE_FLAG, "");
  var gate = loadGate();
  var r = gate({});
  assert(r === null, "should allow stop when idle flag is set");
});

check("Idle flag is one-shot: removed after reading", function() {
  cleanIdleFlag();
  var dir = path.dirname(IDLE_FLAG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(IDLE_FLAG, "");
  var gate = loadGate();
  gate({});
  assert(!fs.existsSync(IDLE_FLAG), "idle flag should be deleted after use");
});

check("Second call after idle flag: blocks again", function() {
  cleanIdleFlag();
  var dir = path.dirname(IDLE_FLAG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(IDLE_FLAG, "");
  var gate = loadGate();
  gate({}); // first call removes flag
  var r = gate({}); // second call should block
  assert(r !== null, "should block on second call");
  assert(r.decision === "block");
});

// --- Edge cases ---

check("Returns same block regardless of input", function() {
  cleanIdleFlag();
  var gate = loadGate();
  var r1 = gate({});
  var r2 = gate({ tool_name: "something", stop_reason: "user" });
  assert(r1.reason === r2.reason, "should return same message");
});

// --- Cleanup ---
cleanIdleFlag();

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
