#!/usr/bin/env node
"use strict";
// T572: Tests for no-passive-rules.js
// Blocks creating new .md rule files in ~/.claude/rules/ (global only).
// Editing existing rules and project-scoped rules are allowed.

var path = require("path");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "no-passive-rules.js");
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

var HOME = os.homedir().replace(/\\/g, "/");

// --- Non-Write tools pass ---

check("Edit tool: passes (only blocks Write)", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: HOME + "/.claude/rules/test.md" } }) === null);
});

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: HOME + "/.claude/rules/test.md" } }) === null);
});

check("Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
});

// --- Write to global ~/.claude/rules/*.md: blocks ---

check("Write new .md to global rules: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: HOME + "/.claude/rules/my-rule.md" } });
  assert(r && r.decision === "block", "should block");
  assert(r.reason.indexOf("passive") >= 0 || r.reason.indexOf("BLOCKED") >= 0, "should explain why");
});

check("Write new .md to global rules (backslashes): blocks", function() {
  var gate = loadGate();
  var winPath = HOME.replace(/\//g, "\\") + "\\.claude\\rules\\my-rule.md";
  var r = gate({ tool_name: "Write", tool_input: { file_path: winPath } });
  assert(r && r.decision === "block", "should block with backslash paths");
});

// --- Write to project .claude/rules/*.md: passes ---

check("Write to project .claude/rules/: passes", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/projects/myapp/.claude/rules/my-rule.md" } });
  assert(r === null, "project-scoped rules should be allowed");
});

check("Write to project .claude/rules/ (Windows path): passes", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "C:\\Projects\\app\\.claude\\rules\\test.md" } });
  assert(r === null, "project-scoped rules on Windows should be allowed");
});

// --- Write to global archive: passes ---

check("Write to archive subdir: passes", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: HOME + "/.claude/rules/archive/old-rule.md" } });
  assert(r === null, "archive should be exempted");
});

// --- Write non-.md files: passes ---

check("Write .json to global rules: passes", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: HOME + "/.claude/rules/config.json" } });
  assert(r === null, "only .md files are blocked");
});

check("Write .txt to global rules: passes", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: HOME + "/.claude/rules/notes.txt" } });
  assert(r === null, "only .md files are blocked");
});

// --- Write to non-rules paths: passes ---

check("Write to ~/.claude/settings.json: passes", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: HOME + "/.claude/settings.json" } });
  assert(r === null);
});

check("Write to random path: passes", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/tmp/test.md" } });
  assert(r === null);
});

// --- Write nested path (not direct child of rules/): passes ---

check("Write to subdirectory of rules (not direct .md): passes", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: HOME + "/.claude/rules/sub/nested.md" } });
  assert(r === null, "nested paths are not direct children, should pass regex");
});

// --- Edge cases ---

check("Missing file_path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: {} }) === null);
});

check("Empty file_path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "" } }) === null);
});

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
