#!/usr/bin/env node
"use strict";
// T582: Tests for background-task-audit.js (PostToolUse)
// Detects zero-output background tasks and forces investigation.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "background-task-audit.js");
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

function cleanStateFiles() {
  var files = fs.readdirSync(os.tmpdir()).filter(function(f) { return f.indexOf(".bg-task-audit-") === 0; });
  files.forEach(function(f) { try { fs.unlinkSync(path.join(os.tmpdir(), f)); } catch(e) {} });
}

// --- Non-applicable inputs ---

check("Non-TaskOutput tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" }, tool_result: "" }) === null);
});

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: {}, tool_result: "" }) === null);
});

// --- Completed with output: passes ---

check("Completed task with output: passes", function() {
  var gate = loadGate();
  var result = "<task_id>abc123</task_id><status>completed</status><retrieval_status>done</retrieval_status><output>Some real output here</output>";
  assert(gate({ tool_name: "TaskOutput", tool_result: result }) === null);
});

// --- Case 1: Completed with zero output ---

check("Completed + zero output: blocks", function() {
  var gate = loadGate();
  var result = "<task_id>task001</task_id><status>completed</status><retrieval_status>done</retrieval_status><output></output>";
  var r = gate({ tool_name: "TaskOutput", tool_result: result });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("ZERO OUTPUT") !== -1);
  assert(r.reason.indexOf("task001") !== -1);
});

check("Completed + whitespace-only output: blocks", function() {
  var gate = loadGate();
  var result = "<task_id>task002</task_id><status>completed</status><retrieval_status>done</retrieval_status><output>   \n  </output>";
  var r = gate({ tool_name: "TaskOutput", tool_result: result });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

// --- Case 2: Timeout with zero output ---

check("Timeout + zero output: blocks", function() {
  var gate = loadGate();
  var result = "<task_id>task003</task_id><status>running</status><retrieval_status>timeout</retrieval_status><output></output>";
  var r = gate({ tool_name: "TaskOutput", tool_result: result });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("TIMEOUT") !== -1);
  assert(r.reason.indexOf("task003") !== -1);
});

check("Timeout + with output: passes", function() {
  var gate = loadGate();
  var result = "<task_id>task004</task_id><status>running</status><retrieval_status>timeout</retrieval_status><output>Partial output before timeout</output>";
  assert(gate({ tool_name: "TaskOutput", tool_result: result }) === null);
});

// --- Case 3: Not ready, repeated polls ---

check("Not ready first poll: passes", function() {
  cleanStateFiles();
  var gate = loadGate();
  var result = "<task_id>taskpoll1</task_id><status>running</status><retrieval_status>not_ready</retrieval_status><output></output>";
  assert(gate({ tool_name: "TaskOutput", tool_result: result }) === null);
});

check("Not ready second poll: blocks", function() {
  cleanStateFiles();
  var gate = loadGate();
  var result = "<task_id>taskpoll2</task_id><status>running</status><retrieval_status>not_ready</retrieval_status><output></output>";
  gate({ tool_name: "TaskOutput", tool_result: result }); // first poll
  var r = gate({ tool_name: "TaskOutput", tool_result: result }); // second poll
  assert(r !== null, "should block on second poll");
  assert(r.decision === "block");
  assert(r.reason.indexOf("polled") !== -1);
  assert(r.reason.indexOf("taskpoll2") !== -1);
  cleanStateFiles();
});

check("Not ready with output: passes even on repeated polls", function() {
  cleanStateFiles();
  var gate = loadGate();
  var result = "<task_id>taskpoll3</task_id><status>running</status><retrieval_status>not_ready</retrieval_status><output>Still working...</output>";
  gate({ tool_name: "TaskOutput", tool_result: result });
  assert(gate({ tool_name: "TaskOutput", tool_result: result }) === null);
  cleanStateFiles();
});

// --- Edge cases ---

check("Missing task_id: uses 'unknown'", function() {
  var gate = loadGate();
  var result = "<status>completed</status><retrieval_status>done</retrieval_status><output></output>";
  var r = gate({ tool_name: "TaskOutput", tool_result: result });
  assert(r !== null, "should block");
  assert(r.reason.indexOf("unknown") !== -1);
});

check("Empty tool_result: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "TaskOutput", tool_result: "" }) === null);
});

check("Null tool_result: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "TaskOutput", tool_result: null }) === null);
});

check("Running + not_ready different task IDs tracked independently", function() {
  cleanStateFiles();
  var gate = loadGate();
  var r1 = "<task_id>taskA</task_id><status>running</status><retrieval_status>not_ready</retrieval_status><output></output>";
  var r2 = "<task_id>taskB</task_id><status>running</status><retrieval_status>not_ready</retrieval_status><output></output>";
  gate({ tool_name: "TaskOutput", tool_result: r1 }); // taskA poll 1
  gate({ tool_name: "TaskOutput", tool_result: r2 }); // taskB poll 1
  // taskA poll 2 should block, taskB poll 1 was just done so taskB poll 2 should also block
  var rA = gate({ tool_name: "TaskOutput", tool_result: r1 });
  assert(rA !== null, "taskA should block on second poll");
  assert(rA.reason.indexOf("taskA") !== -1);
  cleanStateFiles();
});

// --- Cleanup ---
cleanStateFiles();

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
