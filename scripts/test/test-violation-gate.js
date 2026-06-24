#!/usr/bin/env node
"use strict";
// Tests for violation-gate.js — blocks on spirit violations, auto-acknowledges after first block
var fs = require("fs");
var path = require("path");
var os = require("os");

var PASS = 0, FAIL = 0;
function pass(msg) { console.log("  PASS: " + msg); PASS++; }
function fail(msg) { console.log("  FAIL: " + msg); FAIL++; }

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vg-test-"));
var stateDir = path.join(tmpDir, ".claude", "hooks");
fs.mkdirSync(stateDir, { recursive: true });

// Override HOME so the module reads/writes in our temp dir
var origHome = process.env.HOME;
process.env.HOME = tmpDir;

var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "violation-gate.js");
function freshLoad() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

var statePath = path.join(stateDir, "violation-state.json");

process.on("exit", function() {
  process.env.HOME = origHome;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
});

console.log("=== violation-gate tests ===\n");

// --- Module contract ---
console.log("--- Module contract ---");
var gate = freshLoad();
if (typeof gate === "function") pass("exports a function");
else fail("should export a function");

// --- No state file ---
console.log("\n--- No violation state ---");
gate = freshLoad();
var r = gate({ tool_name: "Bash", tool_input: { command: "echo hi" } });
if (r === null) pass("no state file passes");
else fail("should pass when no state file");

// --- No violation in state ---
console.log("\n--- State exists but no violation ---");
fs.writeFileSync(statePath, JSON.stringify({ violation: false }));
gate = freshLoad();
r = gate({ tool_name: "Edit", tool_input: { file_path: "x.js", old_string: "a", new_string: "b" } });
if (r === null) pass("no violation passes");
else fail("should pass when violation=false");

// --- Already acknowledged ---
console.log("\n--- Violation already acknowledged ---");
fs.writeFileSync(statePath, JSON.stringify({ violation: true, acknowledged: true, rule: "test" }));
gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: { file_path: "x.js", content: "y" } });
if (r === null) pass("acknowledged violation passes");
else fail("should pass when already acknowledged");

// --- Active violation blocks ---
console.log("\n--- Active violation blocks ---");
fs.writeFileSync(statePath, JSON.stringify({
  violation: true,
  acknowledged: false,
  rule: "no-bypass-gates",
  severity: "high",
  violation_description: "Used python write_text to bypass gate"
}));
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "echo test" } });
if (r && r.decision === "block") pass("active violation blocks");
else fail("active violation should block");
if (r && r.reason.indexOf("no-bypass-gates") !== -1) pass("block includes rule name");
else fail("block should include rule name");
if (r && r.reason.indexOf("high") !== -1) pass("block includes severity");
else fail("block should include severity");
if (r && r.reason.indexOf("python write_text") !== -1) pass("block includes description");
else fail("block should include description");

// --- Auto-acknowledges after block ---
console.log("\n--- Auto-acknowledge ---");
var stateAfter = JSON.parse(fs.readFileSync(statePath, "utf-8"));
if (stateAfter.acknowledged === true) pass("sets acknowledged=true after block");
else fail("should set acknowledged=true");

// Next call should pass
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "echo test2" } });
if (r === null) pass("second call after acknowledge passes");
else fail("second call should pass after acknowledge");

// --- Block message format ---
console.log("\n--- Block message format ---");
fs.writeFileSync(statePath, JSON.stringify({
  violation: true, acknowledged: false, rule: "test-rule", severity: "medium"
}));
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "x" } });
if (r && r.reason.indexOf("BLOCKED:") !== -1) pass("has BLOCKED:");
else fail("should have BLOCKED:");
if (r && r.reason.indexOf("FALSE POSITIVE") !== -1) pass("has FALSE POSITIVE escape");
else fail("should have FALSE POSITIVE escape");

// --- Logging ---
console.log("\n--- Logging ---");
var logPath = path.join(stateDir, "hook-log.jsonl");
if (fs.existsSync(logPath)) {
  var logContent = fs.readFileSync(logPath, "utf-8");
  if (logContent.indexOf("violation-gate") !== -1) pass("logged to hook-log.jsonl");
  else fail("should log to hook-log.jsonl");
} else {
  fail("hook-log.jsonl should exist after block");
}

// Cleanup
try { fs.unlinkSync(statePath); } catch(e) {}

console.log("\n=== Results: " + PASS + " passed, " + FAIL + " failed ===");
process.exit(FAIL > 0 ? 1 : 0);
