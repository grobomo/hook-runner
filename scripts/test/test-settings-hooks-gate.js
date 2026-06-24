#!/usr/bin/env node
"use strict";
// T570: Tests for settings-hooks-gate.js
// Blocks adding hook entries directly to settings.json — must use module system.

var path = require("path");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "settings-hooks-gate.js");
var gate = require(modPath);
var passed = 0, failed = 0;

// Use dynamic home dir for test paths
var HOME = os.homedir().replace(/\\/g, "/");

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function makeInput(file, oldStr, newStr) {
  return { tool_name: "Edit", tool_input: { file_path: file, old_string: oldStr, new_string: newStr } };
}

// --- Tests ---

check("Non-Edit tool: passes", function() {
  assert(gate({ tool_name: "Bash", tool_input: { command: "cat settings.json" } }) === null);
});

check("Edit non-settings file: passes", function() {
  assert(gate(makeInput("/project/src/app.js", "old", '"type": "command"')) === null);
});

check("Edit settings.json without hook patterns: passes", function() {
  assert(gate(makeInput(HOME + "/.claude/settings.json",
    '"theme": "dark"', '"theme": "light"')) === null);
});

check("Edit settings.json adding 'type: command': blocks", function() {
  var r = gate(makeInput(HOME + "/.claude/settings.json",
    '"hooks": []',
    '"hooks": [{"type": "command", "command": "echo hi"}]'));
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(/hook.runner|module system|WHY:/i.test(r.reason), "reason should mention hook-runner or have WHY format");
});

check("Edit settings.json adding 'command:': blocks", function() {
  var r = gate(makeInput(HOME + "/.claude/settings.json",
    "{}",
    '{"command": "node gate.js"}'));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Edit settings.json adding 'hooks: [': blocks", function() {
  var r = gate(makeInput(HOME + "/.claude/settings.json",
    "{}",
    '{"hooks": []}'));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Edit settings.json adding 'matcher:': blocks", function() {
  var r = gate(makeInput(HOME + "/.claude/settings.json",
    "{}",
    '{"matcher": "Bash"}'));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Edit settings.json adding 'type: prompt': blocks", function() {
  var r = gate(makeInput(HOME + "/.claude/settings.json",
    "{}",
    '{"type": "prompt", "prompt": "Remember X"}'));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Edit settings.json adding 'type: agent': blocks", function() {
  var r = gate(makeInput(HOME + "/.claude/settings.json",
    "{}",
    '{"type": "agent", "command": "run"}'));
  assert(r !== null, "should block");
});

check("Removing hooks (simplifying): passes", function() {
  assert(gate(makeInput(HOME + "/.claude/settings.json",
    '{"hooks": [{"type": "command"}]}',
    '{"hooks": []}')) === null);
});

check("settings.local.json: same enforcement", function() {
  var r = gate(makeInput(HOME + "/.claude/settings.local.json",
    "{}",
    '{"type": "command", "command": "node x.js"}'));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Pattern already in old_string: passes (not adding)", function() {
  assert(gate(makeInput(HOME + "/.claude/settings.json",
    '{"type": "command", "command": "old"}',
    '{"type": "command", "command": "new"}')) === null);
});

check("Windows path: works", function() {
  var winPath = HOME.replace(/\//g, "\\") + "\\.claude\\settings.json";
  var r = gate(makeInput(winPath, "{}", '{"type": "command"}'));
  assert(r !== null, "should block on Windows path");
});

check("Empty tool_input: passes gracefully", function() {
  assert(gate({ tool_name: "Edit", tool_input: {} }) === null);
});

// Summary
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
