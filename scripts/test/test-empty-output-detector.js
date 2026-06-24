#!/usr/bin/env node
"use strict";
// T581: Tests for empty-output-detector.js (PostToolUse)
// Warns when commands that normally produce output return empty.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "empty-output-detector.js");
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

// --- Non-Bash tool: passes ---

check("Non-Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "x" }, tool_result: "" }) === null);
});

// --- Commands with output: passes ---

check("ls with output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" }, tool_result: "file1.txt\nfile2.txt" }) === null);
});

check("cat with output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "cat README.md" }, tool_result: "# README" }) === null);
});

check("curl with output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "curl https://example.com" }, tool_result: "<html>..." }) === null);
});

// --- Expected-output commands with empty output: blocks ---

check("ls with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "ls screenshots/" }, tool_result: "" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(/BLOCKED|empty.*output/i.test(r.reason));
});

check("find with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "find . -name '*.py'" }, tool_result: "" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("cat with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "cat myfile.txt" }, tool_result: "" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("node --test with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "node test.js --test" }, tool_result: "" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("node setup.js --health with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "node setup.js --health" }, tool_result: "" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("curl with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "curl -s http://localhost:8080" }, tool_result: "  " });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("kubectl get pods with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "kubectl get pods" }, tool_result: "" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("kubectl describe with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "kubectl describe pod mypod" }, tool_result: "" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("kubectl logs with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "kubectl logs mypod" }, tool_result: "\n" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("az command with empty output: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "az vm list" }, tool_result: "" });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

// --- Empty-ok commands: passes even with empty output ---

check("cp with empty output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "cp a.txt b.txt" }, tool_result: "" }) === null);
});

check("mv with empty output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "mv a.txt b.txt" }, tool_result: "" }) === null);
});

check("mkdir with empty output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "mkdir -p dir" }, tool_result: "" }) === null);
});

check("rm with empty output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "rm temp.txt" }, tool_result: "" }) === null);
});

check("git add with empty output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "git add file.txt" }, tool_result: "" }) === null);
});

check("git push with empty output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "git push origin main" }, tool_result: "" }) === null);
});

check("redirect with empty output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "echo hello > out.txt" }, tool_result: "" }) === null);
});

check("pipe to wc: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "cat file.txt | wc -l" }, tool_result: "" }) === null);
});

check("2>&1 redirect: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "some_cmd 2>&1" }, tool_result: "" }) === null);
});

// --- Non-expect-output commands with empty output: passes ---

check("echo with empty output: passes (not in EXPECT_OUTPUT)", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "echo hello" }, tool_result: "" }) === null);
});

check("npm install with empty output: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "npm install" }, tool_result: "" }) === null);
});

// --- Edge cases ---

check("Whitespace-only output from ls: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "ls" }, tool_result: "   \n  " });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Missing tool_result: blocks for ls", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "ls" }, tool_result: "" });
  assert(r !== null, "should block");
});

check("String tool_input: parses correctly", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: JSON.stringify({ command: "ls" }), tool_result: "" });
  assert(r !== null, "should block");
});

check("Reason includes command excerpt", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "ls my-directory/" }, tool_result: "" });
  assert(r !== null, "should block");
  assert(r.reason.indexOf("ls my-directory/") !== -1);
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
