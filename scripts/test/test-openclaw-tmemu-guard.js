#!/usr/bin/env node
"use strict";
// Tests for openclaw-tmemu-guard.js — blocks hook edits in _tmemu/openclaw
var path = require("path");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
    passed++;
  } catch (e) {
    console.log("FAIL: " + name + " — " + e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function loadGuard() {
  var modPath = path.resolve(__dirname, "../../modules/PreToolUse/_openclaw/tmemu-guard.js");
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

// --- Edit/Write to _tmemu/openclaw hooks: blocked ---

test("Edit hook file in _tmemu/openclaw: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Edit", tool_input: { file_path: "C:/Users/joelg/Documents/ProjectsCL1/_tmemu/openclaw/hooks/my-hook/handler.ts", old_string: "a", new_string: "b" } });
  assert(r !== null && r.decision === "block", "should block");
});

test("Write hook file in _tmemu/openclaw: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Write", tool_input: { file_path: "/home/ubu/.openclaw/hooks/test-hook/handler.ts", content: "export default () => {}" } });
  // This path doesn't contain _tmemu/openclaw, so it won't match
  assert(r === null, "WSL internal paths don't match _tmemu pattern");
});

test("Write to _tmemu/openclaw/.openclaw/hooks: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Write", tool_input: { file_path: "C:\\Users\\joelg\\Documents\\ProjectsCL1\\_tmemu\\openclaw\\.openclaw\\hooks\\gate\\handler.ts", content: "{}" } });
  assert(r !== null && r.decision === "block", "should block backslash paths too");
});

test("Edit run-modules in _tmemu/openclaw: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Edit", tool_input: { file_path: "C:/Users/joelg/Documents/ProjectsCL1/_tmemu/openclaw/run-modules/PreToolUse/gate.js", old_string: "a", new_string: "b" } });
  assert(r !== null && r.decision === "block", "should block run-modules edits");
});

// --- Non-hook files in _tmemu/openclaw: allowed ---

test("Edit non-hook file in _tmemu/openclaw: allowed", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Edit", tool_input: { file_path: "C:/Users/joelg/Documents/ProjectsCL1/_tmemu/openclaw/TODO.md", old_string: "a", new_string: "b" } });
  assert(r === null, "should allow non-hook edits");
});

test("Write script in _tmemu/openclaw: allowed", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Write", tool_input: { file_path: "C:/Users/joelg/Documents/ProjectsCL1/_tmemu/openclaw/scripts/test/new-test.sh", content: "#!/bin/bash" } });
  assert(r === null, "should allow script files");
});

// --- _grobomo/openclaw hooks: allowed ---

test("Edit hook in _grobomo/openclaw: allowed", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Edit", tool_input: { file_path: "C:/Users/joelg/Documents/ProjectsCL1/_grobomo/openclaw/hooks/test-hook/handler.ts", old_string: "a", new_string: "b" } });
  assert(r === null, "should allow _grobomo/openclaw hooks");
});

// --- Bash commands ---

test("Bash WSL write to openclaw hooks: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "wsl -e bash -c 'cp handler.ts ~/.openclaw/hooks/my-hook/'" } });
  assert(r !== null && r.decision === "block", "should block WSL hook writes");
});

test("Bash WSL read openclaw hooks: allowed", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "wsl -e bash -c 'openclaw hooks list'" } });
  assert(r === null, "should allow read-only WSL commands");
});

test("Bash unrelated command: allowed", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "git status" } });
  assert(r === null, "should pass through");
});

// --- Other tools: pass through ---

test("Read tool: always allowed", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Read", tool_input: { file_path: "C:/Users/joelg/Documents/ProjectsCL1/_tmemu/openclaw/hooks/handler.ts" } });
  assert(r === null, "Read should never be blocked");
});

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
