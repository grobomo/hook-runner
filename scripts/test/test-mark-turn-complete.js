#!/usr/bin/env node
"use strict";
// T585: Tests for mark-turn-complete.js (Stop)
// Writes a marker file when Claude finishes a turn normally.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "Stop", "mark-turn-complete.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var MARKER = path.join(os.tmpdir(), ".claude-turn-complete-" + process.ppid);

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function cleanMarker() {
  try { fs.unlinkSync(MARKER); } catch(e) {}
}

// --- Always returns null ---

check("Returns null (never blocks)", function() {
  cleanMarker();
  var gate = loadGate();
  var r = gate({});
  assert(r === null, "should never block");
});

check("Returns null regardless of input", function() {
  cleanMarker();
  var gate = loadGate();
  assert(gate({ tool_name: "Bash" }) === null);
  assert(gate({ some: "data" }) === null);
});

// --- Writes marker file ---

check("Creates marker file", function() {
  cleanMarker();
  var gate = loadGate();
  gate({});
  assert(fs.existsSync(MARKER), "marker file should exist");
  cleanMarker();
});

check("Marker contains JSON with timestamp", function() {
  cleanMarker();
  var gate = loadGate();
  gate({});
  var content = JSON.parse(fs.readFileSync(MARKER, "utf-8"));
  assert(typeof content.ts === "string", "should have ts field");
  assert(content.ts.length > 0, "ts should not be empty");
  // Verify it's a valid ISO date
  assert(!isNaN(Date.parse(content.ts)), "ts should be valid ISO date");
  cleanMarker();
});

check("Marker contains project from env", function() {
  cleanMarker();
  var orig = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = "/test/project";
  var gate = loadGate();
  gate({});
  var content = JSON.parse(fs.readFileSync(MARKER, "utf-8"));
  assert(content.project === "/test/project", "project should match env");
  if (orig !== undefined) process.env.CLAUDE_PROJECT_DIR = orig;
  else delete process.env.CLAUDE_PROJECT_DIR;
  cleanMarker();
});

check("Marker with empty project dir", function() {
  cleanMarker();
  var orig = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  var gate = loadGate();
  gate({});
  var content = JSON.parse(fs.readFileSync(MARKER, "utf-8"));
  assert(content.project === "", "project should be empty string");
  if (orig !== undefined) process.env.CLAUDE_PROJECT_DIR = orig;
  cleanMarker();
});

check("Overwrites previous marker", function() {
  cleanMarker();
  var gate = loadGate();
  gate({});
  var first = JSON.parse(fs.readFileSync(MARKER, "utf-8"));
  // Small delay to get different timestamp
  var start = Date.now();
  while (Date.now() - start < 5) {} // spin 5ms
  gate({});
  var second = JSON.parse(fs.readFileSync(MARKER, "utf-8"));
  assert(second.ts >= first.ts, "second marker should have newer or equal timestamp");
  cleanMarker();
});

// --- Cleanup ---
cleanMarker();

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
