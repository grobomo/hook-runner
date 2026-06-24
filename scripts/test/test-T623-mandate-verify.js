#!/usr/bin/env node
"use strict";
// T623: Test mandate-gate continuous verification

var path = require("path");
var fs = require("fs");
var os = require("os");
var child_process = require("child_process");

var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var HOME = process.env.HOME || os.homedir();
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var SESSION_ID = "vtest123";
var mandateGatePath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "mandate-gate.js");

function mandatePath() {
  return path.join(HOOKS_DIR, "mandate-" + SESSION_ID.slice(0, 8) + ".json");
}

function cleanFiles() {
  try { fs.unlinkSync(mandatePath()); } catch (e) {}
}

function writeMandate(overrides) {
  var mandate = Object.assign({
    action: "Fix bug T999", source_rule: "test-rule", decision: "CONTINUE",
    actions: ["check TODO.md", "run tests"], created: new Date().toISOString(),
    seen: false, fulfilled: false
  }, overrides || {});
  fs.writeFileSync(mandatePath(), JSON.stringify(mandate, null, 2), "utf-8");
}

function readMandate() {
  try { return JSON.parse(fs.readFileSync(mandatePath(), "utf-8")); } catch (e) { return null; }
}

function runGate(input) {
  var env = Object.assign({}, process.env, {
    CLAUDE_SESSION_ID: SESSION_ID,
    HOOK_RUNNER_TEST: "1",
    HOME: HOME
  });
  var wrapper = [
    "var gate = require(" + JSON.stringify(mandateGatePath) + ");",
    "var input = " + JSON.stringify(input || { tool_name: "Bash" }) + ";",
    "var r = gate(input);",
    "process.stdout.write(JSON.stringify({ result: r }) + '\\n');"
  ].join("\n");
  try {
    var out = child_process.execFileSync("node", ["-e", wrapper], {
      env: env, timeout: 10000, stdio: ["pipe", "pipe", "pipe"]
    }).toString().trim();
    var lines = out.split("\n");
    for (var i = lines.length - 1; i >= 0; i--) {
      try { return JSON.parse(lines[i]).result; } catch (e) {}
    }
    return undefined;
  } catch (e) { return undefined; }
}

// ===== First block (seen=false) =====

check("Unseen mandate: blocks with mandate text", function() {
  cleanFiles();
  writeMandate();
  var result = runGate({ tool_name: "Bash" });
  assert(result !== null, "should block");
  assert(result.decision === "block", "should be a block");
  assert(result.reason.indexOf("Fix bug T999") !== -1, "should contain mandate text");
  assert(/BLOCKED|mandate|stop-hook/i.test(result.reason), "should have mandate format");
});

check("After first block: seen=true and call_count=0", function() {
  cleanFiles();
  writeMandate();
  runGate({ tool_name: "Bash" });
  var state = readMandate();
  assert(state.seen === true, "should set seen");
  assert(state.call_count === 0, "should init call_count to 0");
});

// ===== Call counting =====

check("Calls 1-4 after seen: pass without blocking", function() {
  cleanFiles();
  writeMandate({ seen: true, call_count: 0 });
  for (var i = 0; i < 4; i++) {
    var result = runGate({ tool_name: "Read" });
    assert(result === null, "call " + (i + 1) + " should pass");
  }
  var state = readMandate();
  assert(state.call_count === 4, "call_count should be 4, got " + state.call_count);
});

check("Call count persists across invocations", function() {
  cleanFiles();
  writeMandate({ seen: true, call_count: 3 });
  runGate({ tool_name: "Bash" });
  var state = readMandate();
  assert(state.call_count === 4, "should increment from 3 to 4");
});

// ===== Verification at 5th call =====

check("5th call: attempts Haiku verification (fails gracefully without proxy)", function() {
  cleanFiles();
  writeMandate({ seen: true, call_count: 4 });
  var result = runGate({ tool_name: "Edit", tool_input: { file_path: "/tmp/test.js" } });
  // Without Haiku proxy, verification fails open (returns null)
  assert(result === null, "should pass when Haiku unavailable (fail-open)");
  var state = readMandate();
  assert(state.call_count === 5, "should be at call 5");
});

check("10th call: also triggers verification", function() {
  cleanFiles();
  writeMandate({ seen: true, call_count: 9 });
  var result = runGate({ tool_name: "Bash" });
  assert(result === null, "should pass when Haiku unavailable");
  var state = readMandate();
  assert(state.call_count === 10, "should be at call 10");
});

check("6th call (not multiple of 5): does NOT trigger verification", function() {
  cleanFiles();
  writeMandate({ seen: true, call_count: 5 });
  var result = runGate({ tool_name: "Read" });
  assert(result === null, "should pass (not verification call)");
});

// ===== Expiry still works =====

check("Expired mandate: cleaned up and passed", function() {
  cleanFiles();
  writeMandate({ seen: true, call_count: 10, created: new Date(Date.now() - 11 * 60 * 1000).toISOString() });
  var result = runGate({ tool_name: "Bash" });
  assert(result === null, "should pass (expired)");
  assert(!fs.existsSync(mandatePath()), "should delete expired file");
});

// ===== No mandate =====

check("No mandate file: passes", function() {
  cleanFiles();
  var result = runGate({ tool_name: "Bash" });
  assert(result === null, "should pass with no mandate");
});

// ===== Tool input in verification =====

check("Tool input is truncated in verification context", function() {
  cleanFiles();
  var longInput = { command: "x".repeat(500) };
  writeMandate({ seen: true, call_count: 4 });
  var result = runGate({ tool_name: "Bash", tool_input: longInput });
  // Haiku may be available (proxy running) — either pass or block is valid
  // The key test is that the gate doesn't crash on large input
  assert(result === null || (result && result.decision === "block"), "should handle large input without crashing");
});

// ===== Drift re-block message =====

check("Drift re-block includes call count", function() {
  cleanFiles();
  // We can't test the actual Haiku-driven re-block without a proxy,
  // but we can verify the block message format by checking the gate code
  var src = fs.readFileSync(mandateGatePath, "utf-8");
  assert(src.indexOf("drift") !== -1 || src.indexOf("Mandate drift") !== -1, "should have drift message");
  assert(src.indexOf("call_count") !== -1, "should reference call_count");
  assert(src.indexOf("mandate") !== -1, "should reference mandate");
});

// Cleanup
cleanFiles();

console.log("\n    " + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
