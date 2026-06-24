#!/usr/bin/env node
"use strict";
// T823: gate-quality-gate false positive on > /dev/null redirect
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name); console.log("  " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "PreToolUse", "gate-quality-gate.js");
var HOME = os.homedir();
// Use forward slashes — Bash tool always uses Unix paths
var hookDir = path.join(HOME, ".claude", "hooks", "run-modules").replace(/\\/g, "/");

function freshGate() {
  delete require.cache[require.resolve(MOD_PATH)];
  process.env.CLAUDE_PROJECT_DIR = path.join(__dirname, "..", "..");
  return require(MOD_PATH);
}

function bashInput(cmd) {
  return { tool_name: "Bash", tool_input: { command: cmd } };
}

// diff with > /dev/null referencing hook files — should PASS
test("diff > /dev/null passes (not a real write)", function() {
  var gate = freshGate();
  var cmd = "diff " + hookDir + "/PreToolUse/test.js modules/test.js > /dev/null 2>&1";
  var r = gate(bashInput(cmd));
  assert(r === null, "blocked: " + (r ? r.reason.substring(0, 200) : ""));
});

// ls with > /dev/null referencing hook files — should PASS
test("ls > /dev/null passes", function() {
  var gate = freshGate();
  var cmd = "ls " + hookDir + "/PreToolUse/test.js > /dev/null";
  var r = gate(bashInput(cmd));
  assert(r === null, "blocked: " + (r ? r.reason.substring(0, 200) : ""));
});

// actual redirect to a hook .js file — should BLOCK (from non-HR project)
test("redirect to hook .js file blocks (non-HR project)", function() {
  delete require.cache[require.resolve(MOD_PATH)];
  process.env.CLAUDE_PROJECT_DIR = "/some/other/project";
  var gate = require(MOD_PATH);
  var cmd = "echo bad > " + hookDir + "/PreToolUse/test.js";
  var r = gate(bashInput(cmd));
  process.env.CLAUDE_PROJECT_DIR = path.join(__dirname, "..", "..");
  assert(r && r.decision === "block", "should block redirect to hook file");
});

// 2>/dev/null should pass (stderr redirect, not stdout)
test("2>/dev/null passes (stderr redirect)", function() {
  var gate = freshGate();
  var cmd = "node " + hookDir + "/PreToolUse/test.js 2>/dev/null";
  var r = gate(bashInput(cmd));
  assert(r === null, "blocked: " + (r ? r.reason.substring(0, 200) : ""));
});

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);
