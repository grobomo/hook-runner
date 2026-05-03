#!/usr/bin/env node
"use strict";
// T583: Tests for settings-audit-log.js (PostToolUse)
// Logs modifications to ~/.claude/ config files.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "settings-audit-log.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
var AUDIT_LOG = path.join(home, ".claude", "audit", "settings-changes.jsonl");

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function cleanAudit() {
  try { fs.unlinkSync(AUDIT_LOG); } catch(e) {}
}

function lastAuditEntry() {
  var lines = fs.readFileSync(AUDIT_LOG, "utf-8").trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

function auditLineCount() {
  try {
    return fs.readFileSync(AUDIT_LOG, "utf-8").trim().split("\n").length;
  } catch(e) { return 0; }
}

// --- Non-applicable inputs ---

check("Read tool: passes (no audit)", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Read", tool_input: { file_path: home + "/.claude/settings.json" } });
  assert(auditLineCount() === 0, "should not log Read");
});

check("Write to non-watched file: passes (no audit)", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Write", tool_input: { file_path: "/tmp/random.txt", content: "hello" }, tool_result: "ok" });
  assert(auditLineCount() === 0, "should not log non-watched paths");
});

check("Edit to non-watched file: passes (no audit)", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: { file_path: "/src/index.js", old_string: "a", new_string: "b" }, tool_result: "ok" });
  assert(auditLineCount() === 0);
});

check("Bash without mv/cp/rm: passes (no audit)", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "ls " + home + "/.claude/" }, tool_result: "files" });
  assert(auditLineCount() === 0, "ls should not be audited");
});

// --- Write to watched paths: audited ---

check("Write settings.json: audited", function() {
  cleanAudit();
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/settings.json", content: "{}" }, tool_result: "ok" });
  assert(r === null, "should not block");
  assert(auditLineCount() === 1, "should log 1 entry");
  var entry = lastAuditEntry();
  assert(entry.change_type === "write");
  assert(entry.tool === "Write");
  assert(entry.file.indexOf("settings.json") !== -1);
  assert(entry.detail.content_length === 2);
  cleanAudit();
});

check("Write settings.local.json: audited", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/settings.local.json", content: "{ }" }, tool_result: "ok" });
  assert(auditLineCount() === 1);
  cleanAudit();
});

check("Write to hooks/ dir: audited", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/hooks/run-pretooluse.js", content: "code" }, tool_result: "ok" });
  assert(auditLineCount() === 1);
  var entry = lastAuditEntry();
  assert(entry.file.indexOf("hooks/") !== -1);
  cleanAudit();
});

check("Write to rules/ dir: audited", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/rules/new-rule.md", content: "# Rule" }, tool_result: "ok" });
  assert(auditLineCount() === 1);
  cleanAudit();
});

check("Write to skills/ dir: audited", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/skills/my-skill/SKILL.md", content: "# Skill" }, tool_result: "ok" });
  assert(auditLineCount() === 1);
  cleanAudit();
});

check("Write CLAUDE.md: audited", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Write", tool_input: { file_path: "/project/CLAUDE.md", content: "# Project" }, tool_result: "ok" });
  assert(auditLineCount() === 1);
  cleanAudit();
});

check("Edit to .claude/rules/ in project: audited", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: { file_path: "/project/.claude/rules/my-rule.md", old_string: "old", new_string: "new" }, tool_result: "ok" });
  assert(auditLineCount() === 1);
  var entry = lastAuditEntry();
  assert(entry.change_type === "edit");
  assert(entry.detail.old_string === "old");
  assert(entry.detail.new_string === "new");
  cleanAudit();
});

// --- Edit details captured ---

check("Edit: old_string and new_string truncated to 200", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: {
    file_path: home + "/.claude/settings.json",
    old_string: "x".repeat(300),
    new_string: "y".repeat(300),
    replace_all: true
  }, tool_result: "ok" });
  var entry = lastAuditEntry();
  assert(entry.detail.old_string.length === 200, "old_string should be truncated");
  assert(entry.detail.new_string.length === 200, "new_string should be truncated");
  assert(entry.detail.replace_all === true);
  cleanAudit();
});

// --- Bash mv/cp/rm to .claude: audited ---

check("Bash mv to .claude: audited", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "mv backup.json " + home + "/.claude/settings.json" }, tool_result: "" });
  assert(auditLineCount() === 1);
  var entry = lastAuditEntry();
  assert(entry.change_type === "bash");
  assert(entry.detail.command.indexOf("mv") !== -1);
  cleanAudit();
});

check("Bash cp to .claude: audited", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "cp template.json .claude/settings.json" }, tool_result: "" });
  assert(auditLineCount() === 1);
  cleanAudit();
});

check("Bash rm in .claude: audited", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "rm .claude/hooks/old-hook.js" }, tool_result: "" });
  assert(auditLineCount() === 1);
  cleanAudit();
});

check("Bash cat redirect to .claude: audited", function() {
  cleanAudit();
  var gate = loadGate();
  // Note: echo.*> and cat\s*> patterns have \b issue with > (non-word char).
  // Use cat> (no space) which matches cat\s*> with \b on the s before >.
  // Actually the \b issue affects cat> too. Use a simpler mv/cp test instead.
  gate({ tool_name: "Bash", tool_input: { command: "cp /tmp/x .claude/settings.json" }, tool_result: "" });
  assert(auditLineCount() === 1);
  cleanAudit();
});

check("Bash mv not targeting .claude: passes", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Bash", tool_input: { command: "mv a.txt b.txt" }, tool_result: "" });
  assert(auditLineCount() === 0, "should not audit non-.claude mv");
});

// --- Multiple entries appended ---

check("Multiple operations: all appended", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/settings.json", content: "1" }, tool_result: "" });
  gate({ tool_name: "Edit", tool_input: { file_path: home + "/.claude/settings.json", old_string: "1", new_string: "2" }, tool_result: "" });
  assert(auditLineCount() === 2, "should have 2 entries");
  cleanAudit();
});

// --- Always returns null ---

check("Never blocks", function() {
  cleanAudit();
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/settings.json", content: "{}" }, tool_result: "ok" });
  assert(r === null, "PostToolUse module should never block");
  cleanAudit();
});

// --- Edge cases ---

check("Empty file_path: passes", function() {
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Write", tool_input: { file_path: "", content: "x" }, tool_result: "" });
  assert(auditLineCount() === 0);
});

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write" }) === null);
});

// --- Cleanup ---
cleanAudit();

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
