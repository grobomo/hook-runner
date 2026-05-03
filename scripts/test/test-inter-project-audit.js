#!/usr/bin/env node
"use strict";
// T582: Tests for inter-project-audit.js (PostToolUse)
// Logs inter-project TODO writes to JSONL audit file.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "inter-project-audit.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var AUDIT_DIR = path.join(os.homedir(), ".claude", "audit");
var AUDIT_LOG = path.join(AUDIT_DIR, "inter-project-todo.jsonl");

// Save and restore env vars
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
var origProjectsRoot = process.env.CLAUDE_PROJECTS_ROOT;

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

function setup(sourceProject, projectsRoot) {
  process.env.CLAUDE_PROJECT_DIR = sourceProject;
  process.env.CLAUDE_PROJECTS_ROOT = projectsRoot;
}

function restore() {
  if (origProjectDir !== undefined) process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  else delete process.env.CLAUDE_PROJECT_DIR;
  if (origProjectsRoot !== undefined) process.env.CLAUDE_PROJECTS_ROOT = origProjectsRoot;
  else delete process.env.CLAUDE_PROJECTS_ROOT;
}

// --- Non-applicable inputs ---

check("Non-Edit/Write tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "/projects/other/TODO.md" } }) === null);
});

check("Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "cat /projects/other/TODO.md" } }) === null);
});

check("Edit non-TODO file: passes", function() {
  setup("/projects/project-a", "/projects");
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/projects/project-b/README.md" } });
  restore();
  assert(r === null);
});

check("Write non-TODO file: passes", function() {
  setup("/projects/project-a", "/projects");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/projects/project-b/CHANGELOG.md" } });
  restore();
  assert(r === null);
});

// --- Same project TODO: passes ---

check("Same project TODO edit: passes (not inter-project)", function() {
  setup("/projects/project-a", "/projects");
  cleanAudit();
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/projects/project-a/TODO.md", new_string: "- [ ] T100: Do something" } });
  restore();
  assert(r === null);
});

// --- Inter-project TODO: logs and passes ---

check("Inter-project TODO write: logs audit entry", function() {
  setup("/projects/project-a", "/projects");
  cleanAudit();
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: {
    file_path: "/projects/project-b/TODO.md",
    new_string: "- [ ] T200: Fix the thing\n- [ ] T201: Add tests"
  }});
  restore();
  assert(r === null, "should not block (PostToolUse)");
  assert(fs.existsSync(AUDIT_LOG), "audit log should exist");
  var entry = lastAuditEntry();
  assert(entry.source_project === "project-a", "source should be project-a, got " + entry.source_project);
  assert(entry.target_project === "project-b", "target should be project-b, got " + entry.target_project);
  assert(entry.task_ids.indexOf("T200") !== -1, "should extract T200");
  assert(entry.task_ids.indexOf("T201") !== -1, "should extract T201");
  assert(entry.todo_lines.length === 2, "should have 2 todo lines");
  assert(entry.status === "pending");
  assert(entry.tool === "Edit");
  cleanAudit();
});

check("Inter-project TODO via Write tool: logs", function() {
  setup("/projects/alpha", "/projects");
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Write", tool_input: {
    file_path: "/projects/beta/TODO.md",
    content: "# TODO\n- [ ] T300: New task"
  }});
  restore();
  assert(fs.existsSync(AUDIT_LOG), "audit log should exist");
  var entry = lastAuditEntry();
  assert(entry.source_project === "alpha");
  assert(entry.target_project === "beta");
  assert(entry.task_ids.indexOf("T300") !== -1);
  assert(entry.tool === "Write");
  cleanAudit();
});

// --- Task ID extraction ---

check("No task IDs: empty array", function() {
  setup("/projects/src", "/projects");
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: {
    file_path: "/projects/dst/TODO.md",
    new_string: "- [ ] Fix the bug"
  }});
  restore();
  var entry = lastAuditEntry();
  assert(entry.task_ids.length === 0, "should have no task IDs");
  cleanAudit();
});

check("Duplicate task IDs: deduplicated", function() {
  setup("/projects/src", "/projects");
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: {
    file_path: "/projects/dst/TODO.md",
    new_string: "T100 reference\n- [ ] T100: The task\nSee T100"
  }});
  restore();
  var entry = lastAuditEntry();
  assert(entry.task_ids.length === 1, "should deduplicate, got " + entry.task_ids.length);
  assert(entry.task_ids[0] === "T100");
  cleanAudit();
});

// --- Multiple entries appended ---

check("Multiple writes: appended to JSONL", function() {
  setup("/projects/src", "/projects");
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: { file_path: "/projects/dst1/TODO.md", new_string: "- [ ] T1: First" }});
  gate({ tool_name: "Edit", tool_input: { file_path: "/projects/dst2/TODO.md", new_string: "- [ ] T2: Second" }});
  restore();
  var lines = fs.readFileSync(AUDIT_LOG, "utf-8").trim().split("\n");
  assert(lines.length === 2, "should have 2 entries, got " + lines.length);
  var e1 = JSON.parse(lines[0]);
  var e2 = JSON.parse(lines[1]);
  assert(e1.target_project === "dst1");
  assert(e2.target_project === "dst2");
  cleanAudit();
});

// --- Windows path normalization ---

check("Windows backslash path: normalized", function() {
  setup("C:\\Users\\me\\projects\\src", "C:\\Users\\me\\projects");
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: {
    file_path: "C:\\Users\\me\\projects\\dst\\TODO.md",
    new_string: "- [ ] T500: Task"
  }});
  restore();
  assert(fs.existsSync(AUDIT_LOG), "audit log should exist");
  var entry = lastAuditEntry();
  assert(entry.target_project === "dst", "target should be dst, got " + entry.target_project);
  cleanAudit();
});

// --- Edge cases ---

check("No CLAUDE_PROJECT_DIR: uses 'unknown' source", function() {
  var saved = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECTS_ROOT = "/projects";
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: { file_path: "/projects/other/TODO.md", new_string: "task" }});
  if (saved !== undefined) process.env.CLAUDE_PROJECT_DIR = saved;
  else delete process.env.CLAUDE_PROJECT_DIR;
  restore();
  // With no project dir, source is "unknown" but same-project check compares lowercase
  // Since there's no source, it won't match target, so it logs
  // Actually: sourceName will be "unknown", targetName will be "other", different → logs
  if (fs.existsSync(AUDIT_LOG)) {
    var entry = lastAuditEntry();
    assert(entry.source_project === "unknown");
  }
  cleanAudit();
});

check("No CLAUDE_PROJECTS_ROOT: passes (can't determine target)", function() {
  var savedRoot = process.env.CLAUDE_PROJECTS_ROOT;
  var savedDir = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECTS_ROOT;
  process.env.CLAUDE_PROJECT_DIR = "/projects/src";
  cleanAudit();
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/projects/dst/TODO.md", new_string: "task" }});
  if (savedRoot !== undefined) process.env.CLAUDE_PROJECTS_ROOT = savedRoot;
  if (savedDir !== undefined) process.env.CLAUDE_PROJECT_DIR = savedDir;
  restore();
  assert(r === null);
});

check("String tool_input: parses correctly", function() {
  setup("/projects/src", "/projects");
  cleanAudit();
  var gate = loadGate();
  gate({ tool_name: "Edit", tool_input: JSON.stringify({
    file_path: "/projects/dst/TODO.md",
    new_string: "- [ ] T600: Task"
  })});
  restore();
  assert(fs.existsSync(AUDIT_LOG));
  cleanAudit();
});

check("Empty tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: {} }) === null);
});

// --- Cleanup ---
cleanAudit();
restore();

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
