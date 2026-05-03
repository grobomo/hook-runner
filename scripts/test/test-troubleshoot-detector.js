#!/usr/bin/env node
"use strict";
// T583: Tests for troubleshoot-detector.js (PostToolUse)
// Detects fail-fail-succeed patterns and prompts to create hook modules.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "troubleshoot-detector.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// State file uses process.ppid for isolation
var STATE_FILE = path.join(os.tmpdir(), ".claude-bash-failures-" + process.ppid + ".json");

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function cleanState() {
  try { fs.unlinkSync(STATE_FILE); } catch(e) {}
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

// --- Non-applicable inputs ---

check("Non-Bash tool: passes", function() {
  cleanState();
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: {} }) === null);
});

// --- Single success with no prior failures: passes ---

check("Success with no prior failures: passes", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "ls" }, tool_output: "file1\nfile2" });
  assert(r === null);
});

// --- Recording failures ---

check("Single failure: recorded, returns null", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "bad-cmd" }, tool_output: "Exit code 1" });
  assert(r === null, "should not block on failure");
  // Verify state was saved
  var state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  assert(state.failures.length === 1, "should have 1 failure");
  assert(state.failures[0].cmd === "bad-cmd");
  cleanState();
});

check("Two failures recorded", function() {
  cleanState();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "try1" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "try2" }, tool_output: "Exit code 127" });
  var state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  assert(state.failures.length === 2, "should have 2 failures");
  cleanState();
});

// --- Fail-fail-succeed pattern: blocks ---

check("2 failures then success: blocks with troubleshooting cycle", function() {
  cleanState();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "wrong-syntax" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "wrong-flag" }, tool_output: "Exit code 1" });
  var r = gate({ tool_name: "Bash", tool_input: { command: "correct-cmd" }, tool_output: "success output" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("TROUBLESHOOTING CYCLE") !== -1);
  assert(r.reason.indexOf("wrong-syntax") !== -1);
  assert(r.reason.indexOf("wrong-flag") !== -1);
  assert(r.reason.indexOf("correct-cmd") !== -1);
  cleanState();
});

check("3 failures then success: blocks with count", function() {
  cleanState();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "try1" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "try2" }, tool_output: "Exit code 2" });
  gate({ tool_name: "Bash", tool_input: { command: "try3" }, tool_output: "error happened" });
  var r = gate({ tool_name: "Bash", tool_input: { command: "finally" }, tool_output: "works!" });
  assert(r !== null, "should block");
  assert(r.reason.indexOf("3 failed attempts") !== -1);
  cleanState();
});

// --- Single failure then success: no block ---

check("1 failure then success: passes (below threshold)", function() {
  cleanState();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "oops" }, tool_output: "Exit code 1" });
  var r = gate({ tool_name: "Bash", tool_input: { command: "ok" }, tool_output: "fine" });
  assert(r === null, "should not block with only 1 prior failure");
  cleanState();
});

// --- Cooldown: no repeat within 5 minutes ---

check("Cooldown: second cycle within 5min: passes", function() {
  cleanState();
  var gate = loadGate();
  // First cycle
  gate({ tool_name: "Bash", tool_input: { command: "a" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "b" }, tool_output: "Exit code 1" });
  var r1 = gate({ tool_name: "Bash", tool_input: { command: "c" }, tool_output: "ok" });
  assert(r1 !== null, "first cycle should block");
  // Second cycle immediately after
  gate({ tool_name: "Bash", tool_input: { command: "d" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "e" }, tool_output: "Exit code 1" });
  var r2 = gate({ tool_name: "Bash", tool_input: { command: "f" }, tool_output: "ok" });
  assert(r2 === null, "second cycle within 5min should be suppressed");
  cleanState();
});

// --- Failure expiry: old failures pruned ---

check("Old failures (>5min) pruned", function() {
  cleanState();
  // Write state with old failures
  writeState({
    failures: [
      { ts: Date.now() - 400000, cmd: "old1" },
      { ts: Date.now() - 350000, cmd: "old2" }
    ],
    lastPrompted: 0
  });
  var gate = loadGate();
  // Record a new failure — old ones should be pruned
  gate({ tool_name: "Bash", tool_input: { command: "new-fail" }, tool_output: "Exit code 1" });
  var state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  assert(state.failures.length === 1, "old failures should be pruned, got " + state.failures.length);
  assert(state.failures[0].cmd === "new-fail");
  cleanState();
});

// --- Exit code detection ---

check("Output with 'error' keyword: treated as failure", function() {
  cleanState();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "bad" }, tool_output: "some error occurred" });
  var state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  assert(state.failures.length === 1, "error in output should count as failure");
  cleanState();
});

check("No error indicators: treated as success", function() {
  cleanState();
  var gate = loadGate();
  // Pre-load 2 failures
  gate({ tool_name: "Bash", tool_input: { command: "f1" }, tool_output: "Exit code 1" });
  gate({ tool_name: "Bash", tool_input: { command: "f2" }, tool_output: "Exit code 1" });
  // No error indicators in output = success
  var r = gate({ tool_name: "Bash", tool_input: { command: "good" }, tool_output: "all good" });
  assert(r !== null, "should detect cycle");
  cleanState();
});

// --- Command truncation ---

check("Long commands truncated to 200 chars", function() {
  cleanState();
  var gate = loadGate();
  var longCmd = "x".repeat(300);
  gate({ tool_name: "Bash", tool_input: { command: longCmd }, tool_output: "Exit code 1" });
  var state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  assert(state.failures[0].cmd.length === 200, "should truncate to 200");
  cleanState();
});

// --- Edge cases ---

check("Empty tool_output: treated as success", function() {
  cleanState();
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "silent" }, tool_output: "" });
  assert(r === null);
  cleanState();
});

check("Missing tool_input: passes", function() {
  cleanState();
  var gate = loadGate();
  assert(gate({ tool_name: "Bash" }) === null);
  cleanState();
});

// --- Cleanup ---
cleanState();

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
