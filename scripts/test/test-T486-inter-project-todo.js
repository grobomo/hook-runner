#!/usr/bin/env node
"use strict";
// T486: Tests for inter-project TODO priority system
// Tests: PostToolUse audit logger, SessionStart priority injection, PreToolUse priority gate
var path = require("path");
var fs = require("fs");
var os = require("os");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
    passed++;
  } catch (e) {
    console.log("FAIL: " + name + " — " + e.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

var REPO_DIR = path.resolve(__dirname, "../..");

// Helper: create a temp projects root with two projects
function createTempProjects() {
  var root = path.join(os.tmpdir(), "xref-test-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  fs.mkdirSync(path.join(root, "project-a", "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "project-b", "src"), { recursive: true });
  return root;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {}
}

// Save original env
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
var origProjectsRoot = process.env.CLAUDE_PROJECTS_ROOT;
var origSessionId = process.env.CLAUDE_SESSION_ID;
process.env.HOOK_RUNNER_TEST = "1";

// ==========================================
// PostToolUse: inter-project-audit.js
// ==========================================

test("audit: logs inter-project TODO write", function() {
  var root = createTempProjects();
  var auditLog = path.join(os.homedir(), ".claude", "audit", "inter-project-todo.jsonl");
  // Save existing audit log
  var origAudit;
  try { origAudit = fs.readFileSync(auditLog, "utf-8"); } catch(e) { origAudit = null; }

  process.env.CLAUDE_PROJECT_DIR = path.join(root, "project-a");
  process.env.CLAUDE_PROJECTS_ROOT = root;
  process.env.CLAUDE_SESSION_ID = "test-session-486";

  // Clear cache by re-requiring
  var modPath = path.join(REPO_DIR, "modules", "PostToolUse", "inter-project-audit.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Edit",
    tool_input: {
      file_path: path.join(root, "project-b", "TODO.md"),
      new_string: "- [ ] T999: Fix rendering bug <!-- XREF:project-a:T999 2026-04-18 -->"
    }
  });

  assert(result === null, "should not block (PostToolUse)");

  // Check audit log was written
  var logContent = fs.readFileSync(auditLog, "utf-8");
  var lines = logContent.trim().split("\n");
  var lastEntry = JSON.parse(lines[lines.length - 1]);
  assert(lastEntry.source_project === "project-a", "source should be project-a, got: " + lastEntry.source_project);
  assert(lastEntry.target_project === "project-b", "target should be project-b, got: " + lastEntry.target_project);
  assert(lastEntry.task_ids.indexOf("T999") !== -1, "should capture T999");
  assert(lastEntry.status === "pending", "status should be pending");

  // Restore
  if (origAudit !== null) fs.writeFileSync(auditLog, origAudit);
  else try { fs.unlinkSync(auditLog); } catch(e) {}
  cleanup(root);
});

test("audit: ignores same-project TODO write", function() {
  var root = createTempProjects();
  process.env.CLAUDE_PROJECT_DIR = path.join(root, "project-a");
  process.env.CLAUDE_PROJECTS_ROOT = root;

  var modPath = path.join(REPO_DIR, "modules", "PostToolUse", "inter-project-audit.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Edit",
    tool_input: {
      file_path: path.join(root, "project-a", "TODO.md"),
      new_string: "- [ ] T100: Normal task"
    }
  });
  assert(result === null, "should return null for same-project");
  cleanup(root);
});

test("audit: ignores non-TODO files", function() {
  var root = createTempProjects();
  process.env.CLAUDE_PROJECT_DIR = path.join(root, "project-a");
  process.env.CLAUDE_PROJECTS_ROOT = root;

  var modPath = path.join(REPO_DIR, "modules", "PostToolUse", "inter-project-audit.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Edit",
    tool_input: {
      file_path: path.join(root, "project-b", "src", "app.js"),
      new_string: "console.log('hi')"
    }
  });
  assert(result === null, "should ignore non-TODO files");
  cleanup(root);
});

// ==========================================
// SessionStart: inter-project-priority.js
// ==========================================

test("sessionstart: injects P0 message for XREF items", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"),
    "- [ ] T100: Normal task\n" +
    "- [ ] T999: Fix rendering bug <!-- XREF:project-a:T999 2026-04-18 -->\n"
  );
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "SessionStart", "inter-project-priority.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({});
  assert(result !== null, "should return text");
  assert(result.text.indexOf("P0") !== -1, "should mention P0");
  assert(result.text.indexOf("project-a") !== -1, "should mention source project");
  assert(result.text.indexOf("T999") !== -1, "should mention task ID");

  cleanup(root);
});

test("sessionstart: returns null when no XREF items", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"), "- [ ] T100: Normal task\n");
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "SessionStart", "inter-project-priority.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({});
  assert(result === null, "should return null when no XREF items");

  cleanup(root);
});

test("sessionstart: ignores checked XREF items", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"),
    "- [x] T999: Fix rendering bug <!-- XREF:project-a:T999 2026-04-18 -->\n"
  );
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "SessionStart", "inter-project-priority.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({});
  assert(result === null, "should return null when XREF is checked off");

  cleanup(root);
});

// ==========================================
// PreToolUse: inter-project-priority-gate.js
// ==========================================

test("gate: blocks non-XREF work when XREF items pending", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"),
    "- [ ] T999: Fix rendering bug <!-- XREF:project-a:T999 2026-04-18 -->\n" +
    "- [ ] T100: Normal task\n"
  );
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "PreToolUse", "inter-project-priority-gate.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Edit",
    tool_input: { file_path: path.join(projB, "src", "app.js") },
    _git: { branch: "100-T100-normal-work" }
  });
  assert(result !== null, "should block");
  assert(result.decision === "block", "should be block decision");
  assert(result.reason.indexOf("P0") !== -1, "should mention P0");

  cleanup(root);
});

test("gate: allows work on branch matching XREF task", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"),
    "- [ ] T999: Fix rendering bug <!-- XREF:project-a:T999 2026-04-18 -->\n"
  );
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "PreToolUse", "inter-project-priority-gate.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Edit",
    tool_input: { file_path: path.join(projB, "src", "app.js") },
    _git: { branch: "500-T999-fix-rendering" }
  });
  assert(result === null, "should allow work on XREF branch");

  cleanup(root);
});

test("gate: allows TODO.md edits when XREF pending", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"),
    "- [ ] T999: Fix rendering bug <!-- XREF:project-a:T999 2026-04-18 -->\n"
  );
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "PreToolUse", "inter-project-priority-gate.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Edit",
    tool_input: { file_path: path.join(projB, "TODO.md") },
    _git: { branch: "main" }
  });
  assert(result === null, "should allow TODO.md edits");

  cleanup(root);
});

test("gate: allows test files when XREF pending", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"),
    "- [ ] T999: Fix rendering bug <!-- XREF:project-a:T999 2026-04-18 -->\n"
  );
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "PreToolUse", "inter-project-priority-gate.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Edit",
    tool_input: { file_path: path.join(projB, "src", "app.test.js") },
    _git: { branch: "500-T999-fix-rendering" }
  });
  assert(result === null, "should allow test file edits on XREF branch");

  cleanup(root);
});

test("gate: allows read-only Bash when XREF pending", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"),
    "- [ ] T999: Fix rendering bug <!-- XREF:project-a:T999 2026-04-18 -->\n"
  );
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "PreToolUse", "inter-project-priority-gate.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Bash",
    tool_input: { command: "git status" },
    _git: { branch: "main" }
  });
  assert(result === null, "should allow read-only Bash");

  cleanup(root);
});

test("gate: no block when no XREF items", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"), "- [ ] T100: Normal task\n");
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "PreToolUse", "inter-project-priority-gate.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Edit",
    tool_input: { file_path: path.join(projB, "src", "app.js") },
    _git: { branch: "100-T100-normal-work" }
  });
  assert(result === null, "should not block when no XREF items");

  cleanup(root);
});

test("gate: Inbound Requests section items also trigger gate", function() {
  var root = createTempProjects();
  var projB = path.join(root, "project-b");
  fs.writeFileSync(path.join(projB, "TODO.md"),
    "## Inbound Requests\n" +
    "- [ ] T888: Urgent fix from project-c\n" +
    "\n## Normal\n- [ ] T100: Normal task\n"
  );
  process.env.CLAUDE_PROJECT_DIR = projB;

  var modPath = path.join(REPO_DIR, "modules", "PreToolUse", "inter-project-priority-gate.js");
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);

  var result = mod({
    tool_name: "Edit",
    tool_input: { file_path: path.join(projB, "src", "app.js") },
    _git: { branch: "100-T100-normal-work" }
  });
  assert(result !== null && result.decision === "block", "should block when Inbound Requests has items");

  cleanup(root);
});

// ==========================================
// XREF tag format validation
// ==========================================

test("XREF tag format: parses correctly", function() {
  var XREF_PATTERN = /<!--\s*XREF:([^:]+):(\S+)\s+(\S+)\s*-->/;
  var line = "- [ ] T999: Fix bug <!-- XREF:project-a:T999 2026-04-18 -->";
  var m = line.match(XREF_PATTERN);
  assert(m !== null, "should match");
  assert(m[1] === "project-a", "source should be project-a");
  assert(m[2] === "T999", "taskId should be T999");
  assert(m[3] === "2026-04-18", "date should be 2026-04-18");
});

test("XREF tag: multiple tags on different lines", function() {
  var XREF_PATTERN = /<!--\s*XREF:([^:]+):(\S+)\s+(\S+)\s*-->/;
  var content = "- [ ] T999: Bug A <!-- XREF:proj-a:T999 2026-04-18 -->\n" +
    "- [ ] T888: Bug B <!-- XREF:proj-c:T888 2026-04-17 -->\n";
  var lines = content.split("\n");
  var matches = 0;
  for (var i = 0; i < lines.length; i++) {
    if (XREF_PATTERN.test(lines[i])) matches++;
  }
  assert(matches === 2, "should find 2 XREF tags, got " + matches);
});

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
process.env.CLAUDE_PROJECTS_ROOT = origProjectsRoot || "";
process.env.CLAUDE_SESSION_ID = origSessionId || "";

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
