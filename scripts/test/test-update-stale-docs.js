#!/usr/bin/env node
"use strict";
// T583: Tests for update-stale-docs.js (PostToolUse)
// Reminds to update docs when code files are modified.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "update-stale-docs.js");
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

// --- Non-applicable inputs ---

check("Non-Edit/Write tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
});

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "/src/index.js" } }) === null);
});

// --- Doc files: passes (no reminder for docs) ---

check(".md file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/README.md" } }) === null);
});

check(".txt file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "/project/notes.txt" } }) === null);
});

check(".json file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/package.json" } }) === null);
});

// --- Code files: returns outputToModel ---

check(".js file: returns reminder", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/src/module.js" } });
  assert(r !== null, "should return reminder");
  assert(r.outputToModel !== undefined, "should have outputToModel");
  assert(r.outputToModel.indexOf("removed/renamed") !== -1);
  assert(r.outputToModel.indexOf("CLAUDE.md") !== -1);
});

check(".ts file: returns reminder", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/src/app.ts" } });
  assert(r !== null);
  assert(r.outputToModel !== undefined);
});

check(".py file: returns reminder", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/lib/utils.py" } });
  assert(r !== null);
  assert(r.outputToModel !== undefined);
});

check(".sh file: returns reminder", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/scripts/deploy.sh" } });
  assert(r !== null);
  assert(r.outputToModel !== undefined);
});

check(".yml file: returns reminder", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/config/workflow.yml" } });
  assert(r !== null);
  assert(r.outputToModel !== undefined);
});

// --- No decision/block field ---

check("Does NOT have decision field (uses outputToModel)", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/src/code.js" } });
  assert(r !== null);
  assert(r.decision === undefined, "should not have decision field");
});

// --- Edge cases ---

check("Empty file_path: returns reminder (not .md/.txt/.json)", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "" } });
  assert(r !== null && r.outputToModel !== undefined, "returns reminder for non-doc paths");
});

check("Missing tool_input: returns reminder", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit" });
  assert(r !== null && r.outputToModel !== undefined);
});

check("Case sensitivity: .MD passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/docs/NOTES.MD" } }) === null);
});

check("Case sensitivity: .JSON passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/config/DATA.JSON" } }) === null);
});

check("Case sensitivity: .TXT passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/docs/README.TXT" } }) === null);
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
