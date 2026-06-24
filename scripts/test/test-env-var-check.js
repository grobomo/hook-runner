#!/usr/bin/env node
"use strict";
// T574: Tests for env-var-check.js
// Blocks Write/Edit/Bash when required env vars (from .env.required) are missing.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "env-var-check.js");
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

// Create a temp dir with .env.required for testing
var tmpDir = path.join(os.tmpdir(), "test-env-var-check-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

var origProjectDir = process.env.CLAUDE_PROJECT_DIR;

function cleanup() {
  process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
  try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
}

// --- Non-gated tools pass ---

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "x" } }) === null);
});

check("Glob tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Glob", tool_input: { pattern: "*.js" } }) === null);
});

// --- No .env.required file: passes ---

check("No .env.required file: Write passes", function() {
  process.env.CLAUDE_PROJECT_DIR = tmpDir;
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "test.js", content: "x" } }) === null);
});

check("No .env.required file: Edit passes", function() {
  process.env.CLAUDE_PROJECT_DIR = tmpDir;
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "test.js" } }) === null);
});

check("No .env.required file: Bash passes", function() {
  process.env.CLAUDE_PROJECT_DIR = tmpDir;
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "echo hi" } }) === null);
});

// --- Empty .env.required: passes ---

check("Empty .env.required: passes", function() {
  var dir2 = path.join(tmpDir, "empty");
  fs.mkdirSync(dir2, { recursive: true });
  fs.writeFileSync(path.join(dir2, ".env.required"), "\n\n# just comments\n");
  process.env.CLAUDE_PROJECT_DIR = dir2;
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "x.js", content: "x" } }) === null);
});

// --- Missing env vars: blocks ---

check("Missing required var: blocks Write", function() {
  var dir3 = path.join(tmpDir, "missing");
  fs.mkdirSync(dir3, { recursive: true });
  fs.writeFileSync(path.join(dir3, ".env.required"), "TEST_MISSING_VAR_XYZ_123\n");
  delete process.env.TEST_MISSING_VAR_XYZ_123;
  process.env.CLAUDE_PROJECT_DIR = dir3;
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "x.js", content: "x" } });
  assert(r && r.decision === "block", "should block when var missing");
  assert(/BLOCKED|environment|variable|missing/i.test(r.reason), "should mention env vars");
});

check("Missing required var: blocks Edit", function() {
  var dir3 = path.join(tmpDir, "missing");
  process.env.CLAUDE_PROJECT_DIR = dir3;
  delete process.env.TEST_MISSING_VAR_XYZ_123;
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "x.js" } });
  assert(r && r.decision === "block");
});

check("Missing required var: blocks Bash", function() {
  var dir3 = path.join(tmpDir, "missing");
  process.env.CLAUDE_PROJECT_DIR = dir3;
  delete process.env.TEST_MISSING_VAR_XYZ_123;
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "echo" } });
  assert(r && r.decision === "block");
});

// --- Present env vars: passes ---

check("Required var present: passes", function() {
  var dir4 = path.join(tmpDir, "present");
  fs.mkdirSync(dir4, { recursive: true });
  fs.writeFileSync(path.join(dir4, ".env.required"), "HOME\n");
  process.env.CLAUDE_PROJECT_DIR = dir4;
  var gate = loadGate();
  // HOME is always set
  assert(gate({ tool_name: "Write", tool_input: { file_path: "x.js", content: "x" } }) === null);
});

// --- Comment lines and description format ---

check("Comment lines ignored: passes when only comments", function() {
  var dir5 = path.join(tmpDir, "comments");
  fs.mkdirSync(dir5, { recursive: true });
  fs.writeFileSync(path.join(dir5, ".env.required"), "# This is a comment\n# Another comment\nHOME # user home dir\n");
  process.env.CLAUDE_PROJECT_DIR = dir5;
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "x.js", content: "x" } }) === null);
});

// --- No CLAUDE_PROJECT_DIR: passes ---

check("No CLAUDE_PROJECT_DIR: passes", function() {
  process.env.CLAUDE_PROJECT_DIR = "";
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "x.js", content: "x" } }) === null);
});

// --- Multiple missing vars ---

check("Multiple missing vars: all named in reason", function() {
  var dir6 = path.join(tmpDir, "multi");
  fs.mkdirSync(dir6, { recursive: true });
  fs.writeFileSync(path.join(dir6, ".env.required"), "MISSING_AAA_TEST\nMISSING_BBB_TEST\n");
  delete process.env.MISSING_AAA_TEST;
  delete process.env.MISSING_BBB_TEST;
  process.env.CLAUDE_PROJECT_DIR = dir6;
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "echo" } });
  assert(r && r.decision === "block");
  assert(/BLOCKED|environment|variable/i.test(r.reason));
  assert(/NEXT STEPS:|WHY:/i.test(r.reason));
});

// Cleanup
cleanup();

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
