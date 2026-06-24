#!/usr/bin/env node
"use strict";
// T832: deploy-test-gate — blocks deploy-to-live without tests
var path = require("path");
var os = require("os");
var fs = require("fs");

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS: " + name); passed++; }
  catch (e) { console.log("  FAIL: " + name); console.log("    " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "PreToolUse", "deploy-test-gate.js");
var HOME = os.homedir();
var REPO = path.join(__dirname, "..", "..");

function freshGate() {
  delete require.cache[require.resolve(MOD_PATH)];
  process.env.CLAUDE_PROJECT_DIR = REPO;
  return require(MOD_PATH);
}

function bashInput(cmd) {
  return { tool_name: "Bash", tool_input: { command: cmd } };
}

console.log("=== T832: deploy-test-gate ===\n");

console.log("--- Module contract ---");

test("exports a function", function() {
  var gate = freshGate();
  assert(typeof gate === "function");
});

test("returns null for non-Bash", function() {
  var gate = freshGate();
  assert(gate({ tool_name: "Edit" }) === null);
});

test("returns null for non-cp commands", function() {
  var gate = freshGate();
  assert(gate(bashInput("ls -la")) === null);
});

test("returns null for cp not targeting run-modules", function() {
  var gate = freshGate();
  assert(gate(bashInput("cp foo.js bar.js")) === null);
});

console.log("\n--- Deploy with tests (should pass) ---");

test("allows deploy when test file exists", function() {
  var gate = freshGate();
  // hook-editing-gate has test-T118-hook-editing-gate.sh
  var cmd = 'cp "' + REPO + '/modules/PreToolUse/hook-editing-gate.js" "' +
    HOME + '/.claude/hooks/run-modules/PreToolUse/hook-editing-gate.js"';
  var r = gate(bashInput(cmd));
  assert(r === null, "should pass: " + (r ? r.reason.substring(0, 100) : ""));
});

test("allows deploy of force-push-gate (has test)", function() {
  var gate = freshGate();
  var cmd = 'cp modules/PreToolUse/force-push-gate.js "$HOME/.claude/hooks/run-modules/PreToolUse/force-push-gate.js"';
  var r = gate(bashInput(cmd));
  assert(r === null, "should pass");
});

console.log("\n--- Deploy without tests (should block) ---");

test("blocks deploy of module with no test file", function() {
  var gate = freshGate();
  // Use a fake module name that has no test
  var cmd = 'cp modules/PreToolUse/nonexistent-fake-gate.js "$HOME/.claude/hooks/run-modules/PreToolUse/nonexistent-fake-gate.js"';
  var r = gate(bashInput(cmd));
  assert(r && r.decision === "block", "should block deploy without tests");
});

test("block message mentions tests", function() {
  var gate = freshGate();
  var cmd = 'cp modules/PreToolUse/nonexistent-fake-gate.js "$HOME/.claude/hooks/run-modules/PreToolUse/nonexistent-fake-gate.js"';
  var r = gate(bashInput(cmd));
  assert(r && r.reason.indexOf("test") !== -1, "should mention tests");
});

test("block message has FALSE POSITIVE escape", function() {
  var gate = freshGate();
  var cmd = 'cp modules/PreToolUse/nonexistent-fake-gate.js "$HOME/.claude/hooks/run-modules/PreToolUse/nonexistent-fake-gate.js"';
  var r = gate(bashInput(cmd));
  assert(r && r.reason.indexOf("FALSE POSITIVE") !== -1, "should have FP escape");
});

console.log("\n--- Edge cases ---");

test("skips helper modules (underscore prefix)", function() {
  var gate = freshGate();
  var cmd = 'cp modules/PreToolUse/_haiku-judge.js "$HOME/.claude/hooks/run-modules/PreToolUse/_haiku-judge.js"';
  var r = gate(bashInput(cmd));
  assert(r === null, "should skip underscore-prefixed helpers");
});

test("only fires from hook-runner project", function() {
  delete require.cache[require.resolve(MOD_PATH)];
  process.env.CLAUDE_PROJECT_DIR = "/tmp/other-project";
  var gate = require(MOD_PATH);
  var cmd = 'cp modules/PreToolUse/fake-gate.js "$HOME/.claude/hooks/run-modules/PreToolUse/fake-gate.js"';
  var r = gate(bashInput(cmd));
  process.env.CLAUDE_PROJECT_DIR = REPO;
  assert(r === null, "should skip outside hook-runner");
});

console.log("\n--- Source validation ---");

test("has WORKFLOW tag", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/\/\/ WORKFLOW:/.test(src));
});

test("has WHY comment", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/\/\/ WHY:/.test(src));
});

test("has INCIDENT HISTORY", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/INCIDENT HISTORY/.test(src));
});

test("logs to hook-log.jsonl", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/hook-log\.jsonl/.test(src));
});

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);
