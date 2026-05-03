#!/usr/bin/env node
"use strict";
// T582: Tests for rule-hygiene.js (PostToolUse)
// Validates rule files are granular, short, and correctly scoped.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "rule-hygiene.js");
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

var tmpDir = path.join(os.tmpdir(), "test-rule-hygiene-" + Date.now());
fs.mkdirSync(path.join(tmpDir, "rules"), { recursive: true });

function writeRule(name, content) {
  var p = path.join(tmpDir, "rules", name);
  fs.writeFileSync(p, content);
  return p;
}

// --- Non-applicable inputs ---

check("Non-rules path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/src/index.js" } }) === null);
});

check("Rules path but not .md: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/rules/config.yaml" } }) === null);
});

check("Non-Edit/Write tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "/project/rules/good-rule.md" } }) === null);
});

// --- Good filenames: passes ---

check("Good rule filename: passes", function() {
  var p = writeRule("never-block-on-kubeconfig.md", "# Rule\nDon't block on kubeconfig.\n");
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: p } }) === null);
});

check("Short descriptive rule: passes", function() {
  var p = writeRule("coconut-mailbox.md", "# Coconut Mailbox\nCheck status.\n");
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: p } }) === null);
});

// --- Bad filenames: blocks ---

check("session- prefix: blocks", function() {
  var p = writeRule("session-notes.md", "# Notes\nShort.\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("session-notes") !== -1);
});

check("gotchas filename: blocks", function() {
  var p = writeRule("gotchas.md", "# Gotchas\nShort.\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("misc filename: blocks", function() {
  var p = writeRule("misc.md", "# Misc\nShort.\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("notes filename: blocks", function() {
  var p = writeRule("notes.md", "# Notes\nShort.\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("todo filename: blocks", function() {
  var p = writeRule("todo.md", "# Todo\nShort.\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("temp filename: blocks", function() {
  var p = writeRule("temp.md", "# Temp\nShort.\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

// --- Content checks ---

check("Long rule file (>25 lines): blocks", function() {
  var lines = [];
  for (var i = 0; i < 30; i++) lines.push("Line " + i);
  var p = writeRule("long-rule.md", lines.join("\n"));
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("30 lines") !== -1);
});

check("Exactly 25 lines: passes", function() {
  var lines = [];
  for (var i = 0; i < 25; i++) lines.push("Line " + i);
  var p = writeRule("ok-length.md", lines.join("\n"));
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: p } }) === null);
});

check("Too many ## sections (>2): blocks", function() {
  var content = "# Rule\n## Section 1\nA\n## Section 2\nB\n## Section 3\nC\n";
  var p = writeRule("multi-topic.md", content);
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("3 sections") !== -1);
});

check("Exactly 2 ## sections: passes", function() {
  var content = "# Rule\n## Section 1\nA\n## Section 2\nB\n";
  var p = writeRule("two-sections.md", content);
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: p } }) === null);
});

// --- Project-specific in global rules ---

check("Project keyword in global rules: blocks", function() {
  var home = (process.env.HOME || "").replace(/\\/g, "/");
  if (!home) { console.log("OK: Project keyword in global rules: blocks (skipped — no HOME)"); passed++; return; }
  var globalPath = home + "/.claude/rules/rone-kubeconfig.md";
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: globalPath } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("project-specific") !== -1);
});

check("Non-project keyword in global rules: passes", function() {
  var home = (process.env.HOME || "").replace(/\\/g, "/");
  if (!home) { console.log("OK: Non-project keyword in global rules: passes (skipped — no HOME)"); passed++; return; }
  var globalPath = home + "/.claude/rules/git-safety.md";
  var gate = loadGate();
  // File doesn't exist so content checks won't fire, just filename/path check
  assert(gate({ tool_name: "Edit", tool_input: { file_path: globalPath } }) === null);
});

// --- Windows path normalization ---

check("Windows backslash path: detected", function() {
  var p = writeRule("win-rule.md", "# Rule\nShort.\n");
  var winPath = p.replace(/\//g, "\\");
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: winPath } }) === null);
});

// --- Multiple warnings ---

check("Bad name + long content: multiple warnings", function() {
  var lines = [];
  for (var i = 0; i < 30; i++) lines.push("Line " + i);
  var p = writeRule("misc.md", lines.join("\n"));
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.reason.indexOf("Bad rule filename") !== -1);
  assert(r.reason.indexOf("30 lines") !== -1);
});

// --- Edge cases ---

check("Empty tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: {} }) === null);
});

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit" }) === null);
});

check("File does not exist: only checks filename", function() {
  var gate = loadGate();
  var fakePath = tmpDir + "/rules/session-stuff.md";
  var r = gate({ tool_name: "Edit", tool_input: { file_path: fakePath } });
  assert(r !== null, "should block on bad filename");
  assert(r.reason.indexOf("session-stuff") !== -1);
});

// --- Cleanup ---
try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
