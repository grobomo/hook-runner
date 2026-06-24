#!/usr/bin/env node
"use strict";
// T823: hook-editing-gate allows non-hook settings.json edits from outside hook-runner
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS: " + name); passed++; }
  catch (e) { console.log("  FAIL: " + name); console.log("    " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "PreToolUse", "hook-editing-gate.js");
var HOME = os.homedir();
var SETTINGS = path.join(HOME, ".claude", "settings.json");
var SETTINGS_LOCAL = path.join(HOME, ".claude", "settings.local.json");

function freshGate() {
  delete require.cache[require.resolve(MOD_PATH)];
  return require(MOD_PATH);
}

function runAsOtherProject(gate, tool, filePath, oldStr, newStr, content) {
  process.env.CLAUDE_PROJECT_DIR = "/tmp/some-other-project";
  var input;
  if (tool === "Write") {
    input = { file_path: filePath, content: content || "" };
  } else {
    input = { file_path: filePath, old_string: oldStr || "", new_string: newStr || "" };
  }
  var result = gate({ tool_name: tool, tool_input: input });
  return result;
}

function runAsHookRunner(gate, tool, filePath, oldStr, newStr, content) {
  process.env.CLAUDE_PROJECT_DIR = path.join(__dirname, "..", "..");
  var input;
  if (tool === "Write") {
    input = { file_path: filePath, content: content || "" };
  } else {
    input = { file_path: filePath, old_string: oldStr || "", new_string: newStr || "" };
  }
  var result = gate({ tool_name: tool, tool_input: input });
  return result;
}

console.log("=== T823: hook-editing-gate settings.json non-hook edits ===\n");

console.log("--- Non-hook field edits from other projects (should PASS) ---");

test("Edit effortLevel from other project passes", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"effortLevel": "high"', '"effortLevel": "low"');
  assert(r === null, "should pass but got: " + (r ? r.reason.substring(0, 200) : ""));
});

test("Edit model from other project passes", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"model": "claude-sonnet-4-5-20250514"', '"model": "claude-opus-4-6"');
  assert(r === null, "should pass but got: " + (r ? r.reason.substring(0, 200) : ""));
});

test("Edit env vars from other project passes", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"DEBUG": "false"', '"DEBUG": "true"');
  assert(r === null, "should pass but got: " + (r ? r.reason.substring(0, 200) : ""));
});

test("Edit permissions from other project passes", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"Allow": []', '"Allow": ["Bash(npm test)"]');
  assert(r === null, "should pass but got: " + (r ? r.reason.substring(0, 200) : ""));
});

test("Edit settings.local.json effortLevel from other project passes", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS_LOCAL,
    '"effortLevel": "high"', '"effortLevel": "low"');
  assert(r === null, "should pass but got: " + (r ? r.reason.substring(0, 200) : ""));
});

console.log("\n--- Hook-related edits from other projects (should BLOCK) ---");

test("Edit hooks key from other project blocks", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"hooks": {}', '"hooks": {"PreToolUse": []}');
  assert(r && r.decision === "block", "should block hooks edit");
});

test("Edit PreToolUse from other project blocks", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"command": "old"', '"command": "node run-pretooluse.js"');
  assert(r && r.decision === "block", "should block PreToolUse edit");
});

test("Edit PostToolUse from other project blocks", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"old"', '"PostToolUse": []');
  assert(r && r.decision === "block", "should block PostToolUse edit");
});

test("Edit SessionStart from other project blocks", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"old"', '"SessionStart": [{"command": "node foo.js"}]');
  assert(r && r.decision === "block", "should block SessionStart edit");
});

test("Edit containing run-modules from other project blocks", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"old path"', '"new path with run-modules/PreToolUse"');
  assert(r && r.decision === "block", "should block run-modules edit");
});

test("Edit containing hook-runner from other project blocks", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"old"', '"path/to/hook-runner/setup.js"');
  assert(r && r.decision === "block", "should block hook-runner edit");
});

console.log("\n--- Write (full file) from other projects (should BLOCK) ---");

test("Write full settings.json from other project blocks", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Write", SETTINGS,
    null, null, '{"effortLevel": "low"}');
  assert(r && r.decision === "block", "should block full Write");
  assert(r.reason.indexOf("rewrite") !== -1, "should mention rewrite: " + r.reason.substring(0, 200));
});

console.log("\n--- UserPromptSubmit in settings (universal block) ---");

test("UPS hook edit blocked even from hook-runner", function() {
  var gate = freshGate();
  var r = runAsHookRunner(gate, "Edit", SETTINGS,
    '"old"', '"UserPromptSubmit": [{"command": "node ups.js"}]');
  assert(r && r.decision === "block", "should block UPS hook");
});

console.log("\n--- Hook-runner project itself (should PASS for settings) ---");

test("Edit hooks from hook-runner passes", function() {
  var gate = freshGate();
  var r = runAsHookRunner(gate, "Edit", SETTINGS,
    '"hooks": {}', '"hooks": {"PreToolUse": []}');
  assert(r === null, "should pass from hook-runner");
});

test("Write full settings.json from hook-runner passes", function() {
  var gate = freshGate();
  var r = runAsHookRunner(gate, "Write", SETTINGS,
    null, null, '{"hooks": {"PreToolUse": []}, "effortLevel": "high"}');
  assert(r === null, "should pass from hook-runner");
});

console.log("\n--- Edge cases ---");

test("Edit with Stop in non-hook context passes", function() {
  var gate = freshGate();
  // "Stop" alone shouldn't match — pattern requires Stop near command
  var r = runAsOtherProject(gate, "Edit", SETTINGS,
    '"description": "Start the app"', '"description": "Stop the app"');
  assert(r === null, "should pass: Stop in description isn't hook-related");
});

test("Non-settings file from other project still blocks", function() {
  var gate = freshGate();
  var r = runAsOtherProject(gate, "Edit",
    path.join(HOME, ".claude", "hooks", "run-modules", "PreToolUse", "some-gate.js"),
    "old", "new");
  assert(r && r.decision === "block", "non-settings hook file should still block");
});

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);
