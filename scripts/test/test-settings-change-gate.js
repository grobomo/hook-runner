#!/usr/bin/env node
"use strict";
// T575: Tests for settings-change-gate.js
// Non-blocking gate: returns null for everything (advisory — logged by audit module).
// Tests document the gate's intent and verify it doesn't accidentally block.

var path = require("path");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "settings-change-gate.js");
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

var HOME = os.homedir().replace(/\\/g, "/");

// --- Non-Edit/Write tools pass ---

check("Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
});

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: HOME + "/settings.json" } }) === null);
});

// --- Non-settings files: passes ---

check("Edit random file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.js" } }) === null);
});

check("Write random file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "/tmp/test.js", content: "x" } }) === null);
});

// --- Settings files: passes (non-blocking gate) ---

check("Edit settings.json: passes (non-blocking)", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: HOME + "/.claude/settings.json" } }) === null);
});

check("Edit settings.local.json: passes (non-blocking)", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: HOME + "/.claude/settings.local.json" } }) === null);
});

check("Write to hooks/run-modules/: passes (non-blocking)", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: HOME + "/.claude/hooks/run-modules/PreToolUse/test.js", content: "x" } }) === null);
});

check("Edit run-pretooluse.js: passes (non-blocking)", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: HOME + "/.claude/hooks/run-pretooluse.js" } }) === null);
});

// --- Windows backslash paths: passes ---

check("Edit settings.json with backslashes: passes", function() {
  var gate = loadGate();
  var winPath = HOME.replace(/\//g, "\\") + "\\.claude\\settings.json";
  assert(gate({ tool_name: "Edit", tool_input: { file_path: winPath } }) === null);
});

// --- Edge cases ---

check("Empty file_path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "" } }) === null);
});

check("Missing file_path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: {} }) === null);
});

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
