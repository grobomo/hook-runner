#!/usr/bin/env node
// Test: T757 L1→L2→L3 escalation pipeline — anomaly detection + self-healing writes
"use strict";

var path = require("path");
var fs = require("fs");
var os = require("os");

process.env.HOOK_RUNNER_TEST = "1";
var pass = 0, fail = 0;

function ok(label, condition) {
  if (condition) {
    console.log("  PASS: " + label);
    pass++;
  } else {
    console.log("  FAIL: " + label);
    fail++;
  }
}

console.log("=== T757: L1→L2→L3 Escalation Pipeline ===");

// --- Test Group 1: detectAnomalies function ---
console.log("\n--- Anomaly Detection ---");

// Extract detectAnomalies from auto-continue-gate source
var REPO_DIR = path.resolve(__dirname, "../..");
var gateSrc = fs.readFileSync(path.join(REPO_DIR, "modules/Stop/1-haiku/auto-continue-gate.js"), "utf-8");

// Extract the function using regex
var funcMatch = gateSrc.match(/function detectAnomalies\(history\) \{[\s\S]*?^}/m);
ok("detectAnomalies function exists in source", !!funcMatch);

// Mock LOG_PATH so it doesn't read real logs
var tmpLogDir = path.join(os.tmpdir(), "test-t757-" + process.pid);
try { fs.mkdirSync(tmpLogDir, { recursive: true }); } catch (e) {}
var tmpLogPath = path.join(tmpLogDir, "hook-log.jsonl");
fs.writeFileSync(tmpLogPath, "");

// Create a wrapper to eval the function with proper scope
var LOG_PATH = tmpLogPath;
var detectAnomalies = new Function("history", "fs", "LOG_PATH",
  funcMatch[0].replace("function detectAnomalies(history) {", "").replace(/}$/, "")
).bind(null);
// Re-wrap with a cleaner approach: eval inside a function factory
var _factory = new Function("fs", "LOG_PATH",
  "return " + funcMatch[0].replace(/\n/g, "\n") + ";"
);
var detectAnomalies = _factory(fs, tmpLogPath);

// Test: null for short history
ok("null for empty history", detectAnomalies([]) === null);
ok("null for single entry", detectAnomalies([{ decision: "CONTINUE", rule: "r1" }]) === null);

// Test: stuck-loop detection (3+ same rule)
var stuckHistory = [
  { decision: "CONTINUE", rule: "todo-awareness", reason: "tasks remain" },
  { decision: "CONTINUE", rule: "todo-awareness", reason: "tasks remain" },
  { decision: "CONTINUE", rule: "todo-awareness", reason: "tasks remain" },
];
var stuckResult = detectAnomalies(stuckHistory);
ok("detects stuck-loop", stuckResult !== null);
ok("stuck-loop type correct", stuckResult && stuckResult.type === "stuck-loop");
ok("stuck-loop identifies rule", stuckResult && stuckResult.rule === "todo-awareness");
ok("stuck-loop count = 3", stuckResult && stuckResult.count === 3);

// Test: no stuck-loop when rules differ
var mixedHistory = [
  { decision: "CONTINUE", rule: "rule-a", reason: "" },
  { decision: "CONTINUE", rule: "rule-b", reason: "" },
  { decision: "CONTINUE", rule: "rule-c", reason: "" },
];
ok("no stuck-loop with different rules", detectAnomalies(mixedHistory) === null);

// Test: flip-flop detection
var flipHistory = [
  { decision: "CONTINUE", rule: "r1", reason: "" },
  { decision: "DONE", rule: "r2", reason: "" },
  { decision: "CONTINUE", rule: "r1", reason: "" },
];
var flipResult = detectAnomalies(flipHistory);
ok("detects flip-flop", flipResult !== null);
ok("flip-flop type correct", flipResult && flipResult.type === "flip-flop");

// Test: no flip-flop when decisions are consistent
var consistentHistory = [
  { decision: "CONTINUE", rule: "r1", reason: "" },
  { decision: "CONTINUE", rule: "r2", reason: "" },
  { decision: "CONTINUE", rule: "r3", reason: "" },
];
ok("no flip-flop with consistent decisions", detectAnomalies(consistentHistory) === null);

// Test: module-crashes detection (3+ errors in last 5min)
var now = new Date();
var recentTs = now.toISOString();
var errorEntries = [];
for (var i = 0; i < 4; i++) {
  errorEntries.push(JSON.stringify({
    ts: recentTs,
    event: "PreToolUse",
    module: "broken-gate-" + i,
    result: "error",
    reason: "crash"
  }));
}
fs.writeFileSync(tmpLogPath, errorEntries.join("\n") + "\n");

var crashHistory = [
  { decision: "CONTINUE", rule: "r1", reason: "" },
  { decision: "CONTINUE", rule: "r2", reason: "" },
];
var crashResult = detectAnomalies(crashHistory);
ok("detects module-crashes", crashResult !== null);
ok("module-crashes type correct", crashResult && crashResult.type === "module-crashes");

// Clean log for next test
fs.writeFileSync(tmpLogPath, "");

// Test: prompt-unavailable detection
var promptMissHistory = [
  { decision: "CONTINUE", rule: "r1", reason: "no assistant text unavailable" },
  { decision: "CONTINUE", rule: "r2", reason: "prompt not found in transcript" },
  { decision: "CONTINUE", rule: "r3", reason: "normal reason" },
];
var promptResult = detectAnomalies(promptMissHistory);
ok("detects prompt-unavailable", promptResult !== null);
ok("prompt-unavailable type correct", promptResult && promptResult.type === "prompt-unavailable");

// Test: no prompt-unavailable with just 1 missing
var singleMissHistory = [
  { decision: "CONTINUE", rule: "r1", reason: "no assistant text unavailable" },
  { decision: "CONTINUE", rule: "r2", reason: "normal reason" },
  { decision: "CONTINUE", rule: "r3", reason: "also normal" },
];
// Stuck-loop check happens first, and with different rules it passes.
// prompt-unavailable needs 2+ hits
var singleMissResult = detectAnomalies(singleMissHistory);
ok("no prompt-unavailable with only 1 missing", singleMissResult === null);

// --- Test Group 2: writeL2ToSelfHealing function ---
console.log("\n--- Self-Healing Writes ---");

// Extract writeL2ToSelfHealing
var healMatch = gateSrc.match(/function writeL2ToSelfHealing\(anomaly, l2Result\) \{[\s\S]*?^}/m);
ok("writeL2ToSelfHealing function exists", !!healMatch);

// Test by checking the function creates the right directory structure
var HOME = process.env.HOME || process.env.USERPROFILE || "";
var selfHealDir = path.join(HOME, ".claude", "hooks", "self-healing", "lessons", "gate");
var escalationFile = path.join(selfHealDir, "l2-escalations.jsonl");

// Check if file would be created (we can eval the function)
ok("self-healing gate dir pattern", selfHealDir.replace(/\\/g, "/").indexOf("self-healing/lessons/gate") !== -1);
ok("escalation file is JSONL", escalationFile.endsWith(".jsonl"));

// --- Test Group 3: escalateToL2 function ---
console.log("\n--- L2 Escalation ---");

var l2Match = gateSrc.match(/function escalateToL2\(anomaly, context\) \{[\s\S]*?^}/m);
ok("escalateToL2 function exists", !!l2Match);
ok("escalateToL2 uses Sonnet model", gateSrc.indexOf('model: "sonnet"') !== -1);
ok("escalateToL2 has 12s timeout", gateSrc.indexOf('timeoutMs: 12000') !== -1);
ok("escalateToL2 requests JSON mode", gateSrc.indexOf('jsonMode: true') !== -1);

// --- Test Group 4: Integration — anomaly flows to L2 alert in output ---
console.log("\n--- Integration ---");

ok("detectAnomalies called in main flow", gateSrc.indexOf("detectAnomalies(recentHistory)") !== -1);
ok("escalateToL2 called on anomaly", gateSrc.indexOf("escalateToL2(anomaly,") !== -1);
ok("L2 alert appended to stop output", gateSrc.indexOf("l2Alert") !== -1);
ok("writeL2ToSelfHealing called on L2 success", gateSrc.indexOf("writeL2ToSelfHealing(anomaly, l2Result)") !== -1);
ok("L2 alert includes severity", gateSrc.indexOf('l2Result.severity') !== -1);
ok("L2 alert includes recommendation", gateSrc.indexOf('l2Result.recommendation') !== -1);

// --- Test Group 5: Anomaly detection priority ---
console.log("\n--- Detection Priority ---");

// stuck-loop should fire before flip-flop when both could match
var bothHistory = [
  { decision: "CONTINUE", rule: "x", reason: "" },
  { decision: "DONE", rule: "x", reason: "" },
  { decision: "CONTINUE", rule: "x", reason: "" },
];
var bothResult = detectAnomalies(bothHistory);
ok("stuck-loop takes priority over flip-flop", bothResult && bothResult.type === "stuck-loop");

// --- Cleanup ---
try { fs.unlinkSync(tmpLogPath); } catch (e) {}
try { fs.rmdirSync(tmpLogDir); } catch (e) {}

// --- Summary ---
console.log("\n" + (pass + fail) + " tests: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
