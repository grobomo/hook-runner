#!/usr/bin/env node
"use strict";
// T582: Tests for disk-space-detect.js (PostToolUse)
// Detects disk space errors in output and sets alert mode.

var path = require("path");
var fs = require("fs");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "disk-space-detect.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var STATE_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".claude", ".disk-space-alert"
);

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function cleanState() {
  try { fs.unlinkSync(STATE_FILE); } catch(e) {}
}

// --- Non-disk-error outputs: passes ---

check("Normal output: passes", function() {
  cleanState();
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" }, tool_result: "file1.txt\nfile2.txt" }) === null);
});

check("Empty output: passes", function() {
  cleanState();
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "cp a b" }, tool_result: "" }) === null);
});

check("Generic error (not disk): passes", function() {
  cleanState();
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "node bad.js" }, tool_result: "Error: module not found" }) === null);
});

// --- Disk error patterns: blocks ---

check("ENOSPC: blocks", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "npm install" }, tool_result: "Error: ENOSPC: no space left on device, write" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(/BLOCKED|disk.*space/i.test(r.reason));
  cleanState();
});

check("no space left on device: blocks", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "docker build" }, tool_result: "write /var/lib/docker: no space left on device" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  cleanState();
});

check("disk is full: blocks", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "git clone x" }, tool_result: "fatal: disk is full" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  cleanState();
});

check("not enough space: blocks", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "tar xf big.tar" }, tool_result: "tar: not enough space on disk" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  cleanState();
});

check("out of diskspace: blocks", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "dd if=/dev/zero" }, tool_result: "out of diskspace" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  cleanState();
});

check("Case insensitive: Disk Is Full: blocks", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "x" }, tool_result: "Disk Is Full" });
  assert(r !== null, "should block");
  cleanState();
});

// --- State file management ---

check("Creates state file on disk error", function() {
  cleanState();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "npm install" }, tool_result: "ENOSPC: write failed" });
  assert(fs.existsSync(STATE_FILE), "state file should exist");
  var content = fs.readFileSync(STATE_FILE, "utf-8");
  assert(content.indexOf("ENOSPC") !== -1, "state should contain error");
  cleanState();
});

check("Clears state file on successful command", function() {
  // Create state file first
  var dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, "2026-01-01T00:00:00Z\nprevious error");
  assert(fs.existsSync(STATE_FILE), "precondition: state file exists");

  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "ls" }, tool_result: "some normal output" });
  assert(!fs.existsSync(STATE_FILE), "state file should be cleared after success");
});

check("Does NOT clear state if output has disk error keywords", function() {
  var dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, "2026-01-01T00:00:00Z\nprevious");

  var gate = loadGate();
  // This still has disk+error keywords even though it's not a detection pattern
  gate({ tool_name: "Bash", tool_input: { command: "df" }, tool_result: "error: disk space critical: write failed" });
  assert(fs.existsSync(STATE_FILE), "state should NOT be cleared when disk error keywords present");
  cleanState();
});

// --- Reason content ---

check("Reason mentions disk-monitor scan", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "x" }, tool_result: "ENOSPC" });
  assert(r !== null);
  assert(r.reason.indexOf("disk-monitor") !== -1);
  assert(r.reason.indexOf("DO NOT") !== -1);
  cleanState();
});

// --- String tool_input ---

check("String tool_input: parses correctly", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: JSON.stringify({ command: "x" }), tool_result: "ENOSPC" });
  assert(r !== null, "should block");
  cleanState();
});

// --- Edge cases ---

check("No tool_result: passes", function() {
  cleanState();
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
});

check("Null tool_input: handles gracefully", function() {
  cleanState();
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: null, tool_result: "normal" }) === null);
});

// --- Cleanup ---
cleanState();

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
