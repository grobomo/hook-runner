#!/usr/bin/env node
"use strict";
// Tests for no-rewrite-gate.js — Write/Bash overwrite prevention with sidecar override
var fs = require("fs");
var path = require("path");
var os = require("os");

var PASS = 0, FAIL = 0;
function pass(msg) { console.log("  PASS: " + msg); PASS++; }
function fail(msg) { console.log("  FAIL: " + msg); FAIL++; }

var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "no-rewrite-gate.js");
function freshLoad() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "no-rewrite-test-"));
process.on("exit", function() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
});

var HOME = process.env.HOME || process.env.USERPROFILE || "";

console.log("=== no-rewrite-gate tests ===\n");

// --- Write tool tests ---

console.log("--- Write: new file ---");
var gate = freshLoad();
var newFile = path.join(tmpDir, "new-file.js");
var result = gate({ tool_name: "Write", tool_input: { file_path: newFile } });
if (result === null) pass("Write to non-existent file allowed");
else fail("Should allow writing new file: " + JSON.stringify(result));

console.log("\n--- Write: existing file blocks ---");
var existingFile = path.join(tmpDir, "existing.js");
fs.writeFileSync(existingFile, "original content");
gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: existingFile } });
if (result && result.decision === "block") pass("Write to existing .js file blocked");
else fail("Should block overwriting existing file");

console.log("\n--- Write: .rewrite-approved sidecar override ---");
var approvedFile = path.join(tmpDir, "approved.yml");
fs.writeFileSync(approvedFile, "original yaml");
var sidecar = approvedFile + ".rewrite-approved";
fs.writeFileSync(sidecar, "");
gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: approvedFile } });
if (result === null) pass("Write with .rewrite-approved sidecar allowed");
else fail("Should allow when sidecar exists: " + JSON.stringify(result));

// Verify sidecar was consumed (deleted)
if (!fs.existsSync(sidecar)) pass("Sidecar consumed (deleted) after use");
else fail("Sidecar should be deleted after one-time use");

// Second write without sidecar should block
gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: approvedFile } });
if (result && result.decision === "block") pass("Second write without sidecar blocked");
else fail("Should block after sidecar consumed");

console.log("\n--- Write: allowed patterns ---");
gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: path.join(tmpDir, "TODO.md") } });
if (result === null) pass("TODO.md allowed");
else fail("TODO.md should be allowed");

gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: path.join(tmpDir, "CLAUDE.md") } });
if (result === null) pass("CLAUDE.md allowed");
else fail("CLAUDE.md should be allowed");

gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: path.join(tmpDir, "README.md") } });
if (result === null) pass("README.md allowed");
else fail("README.md should be allowed");

gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: path.join(tmpDir, ".gitignore") } });
if (result === null) pass(".gitignore allowed");
else fail(".gitignore should be allowed");

gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: path.join(tmpDir, "specs", "foo", "spec.md") } });
if (result === null) pass("specs/ files allowed");
else fail("specs/ files should be allowed");

gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: path.join(HOME, ".claude", "hooks", "foo.js") } });
if (result === null) pass("hooks/*.js allowed");
else fail("hooks/*.js should be allowed");

console.log("\n--- Write: non-tool calls skip ---");
gate = freshLoad();
result = gate({ tool_name: "Read", tool_input: { file_path: existingFile } });
if (result === null) pass("Read tool skipped");
else fail("Read should not be checked");

gate = freshLoad();
result = gate({ tool_name: "Edit", tool_input: { file_path: existingFile } });
if (result === null) pass("Edit tool skipped");
else fail("Edit should not be checked");

console.log("\n--- Write: block message format ---");
gate = freshLoad();
result = gate({ tool_name: "Write", tool_input: { file_path: existingFile } });
if (result && result.reason.indexOf("BLOCKED:") !== -1) pass("Block message includes BLOCKED:");
else fail("Block message should include BLOCKED:");
if (result && result.reason.indexOf("rewrite-approved") !== -1) pass("Block message mentions sidecar override");
else fail("Block message should mention sidecar override");
if (result && result.reason.indexOf("FALSE POSITIVE") !== -1) pass("Block message includes FALSE POSITIVE escape");
else fail("Block message should include FALSE POSITIVE escape");

// --- Bash tool tests ---

console.log("\n--- Bash: safe patterns allow ---");
gate = freshLoad();
result = gate({ tool_name: "Bash", tool_input: { command: "git status" } });
if (result === null) pass("git status allowed");
else fail("git should be safe");

gate = freshLoad();
result = gate({ tool_name: "Bash", tool_input: { command: "ls -la /tmp" } });
if (result === null) pass("ls allowed");
else fail("ls should be safe");

gate = freshLoad();
result = gate({ tool_name: "Bash", tool_input: { command: "node test.js" } });
if (result === null) pass("node script allowed");
else fail("node should be safe");

console.log("\n--- Bash: overwrite patterns ---");
// Note: echo is in BASH_SAFE_PATTERNS (safe by design), so echo > file passes
gate = freshLoad();
result = gate({ tool_name: "Bash", tool_input: { command: "echo hello > " + existingFile } });
if (result === null) pass("echo > file allowed (echo is safe pattern)");
else fail("echo is in safe patterns, should allow: " + JSON.stringify(result));

gate = freshLoad();
result = gate({ tool_name: "Bash", tool_input: { command: "sed -i 's/foo/bar/' " + existingFile } });
if (result && result.decision === "block") pass("sed -i blocked");
else fail("sed -i should block");

// tee without -a is an overwrite
gate = freshLoad();
result = gate({ tool_name: "Bash", tool_input: { command: "tee " + existingFile } });
if (result && result.decision === "block") pass("tee without -a blocked");
else fail("tee without -a should block: " + JSON.stringify(result));

console.log("\n=== Results: " + PASS + " passed, " + FAIL + " failed ===");
process.exit(FAIL > 0 ? 1 : 0);
