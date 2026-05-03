#!/usr/bin/env node
"use strict";
// T576: Tests for continuous-claude-gate.js
// Blocks Edit/Write on implementation code unless project has tracked tasks.
// Allows scaffolding files, config, specs. Checks specs/*/tasks.md and TODO.md.

var path = require("path");
var fs = require("fs");
var os = require("os");
var cp = require("child_process");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "continuous-claude-gate.js");
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

// Create temp git repos for testing
var tmpBase = path.join(os.tmpdir(), "test-continuous-claude-" + Date.now());
fs.mkdirSync(tmpBase, { recursive: true });

function createGitRepo(name) {
  var dir = path.join(tmpBase, name);
  fs.mkdirSync(dir, { recursive: true });
  cp.execFileSync("git", ["init"], { cwd: dir, windowsHide: true });
  cp.execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir, windowsHide: true });
  cp.execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, windowsHide: true });
  fs.writeFileSync(path.join(dir, "dummy.txt"), "init");
  cp.execFileSync("git", ["add", "."], { cwd: dir, windowsHide: true });
  cp.execFileSync("git", ["commit", "-m", "init"], { cwd: dir, windowsHide: true });
  return dir;
}

var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
var origSkipSpec = process.env.SKIP_SPEC_GATE;
var origContinuous = process.env.CONTINUOUS_CLAUDE;

function cleanup() {
  process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
  if (origSkipSpec) process.env.SKIP_SPEC_GATE = origSkipSpec;
  else delete process.env.SKIP_SPEC_GATE;
  if (origContinuous) process.env.CONTINUOUS_CLAUDE = origContinuous;
  else delete process.env.CONTINUOUS_CLAUDE;
  try { fs.rmSync(tmpBase, { recursive: true }); } catch(e) {}
}

// --- Non-Edit/Write tools pass ---

check("Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
});

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "x.js" } }) === null);
});

// --- SKIP_SPEC_GATE bypasses ---

check("SKIP_SPEC_GATE=1: passes", function() {
  process.env.SKIP_SPEC_GATE = "1";
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/app.js" } }) === null);
  delete process.env.SKIP_SPEC_GATE;
});

// --- CONTINUOUS_CLAUDE bypasses ---

check("CONTINUOUS_CLAUDE=1: passes", function() {
  process.env.CONTINUOUS_CLAUDE = "1";
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/app.js" } }) === null);
  delete process.env.CONTINUOUS_CLAUDE;
});

// --- Allowed file patterns pass ---

check("Edit TODO.md: passes", function() {
  delete process.env.SKIP_SPEC_GATE;
  delete process.env.CONTINUOUS_CLAUDE;
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/TODO.md" } }) === null);
});

check("Edit SESSION_STATE.md: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/SESSION_STATE.md" } }) === null);
});

check("Edit CLAUDE.md: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/CLAUDE.md" } }) === null);
});

check("Edit .claude/ file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/.claude/config.js" } }) === null);
});

check("Edit specs/ file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/specs/feature/tasks.md" } }) === null);
});

check("Edit .planning/ file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/.planning/PLAN.md" } }) === null);
});

check("Edit .github/ file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/.github/workflows/ci.yml" } }) === null);
});

check("Edit .gitignore: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/.gitignore" } }) === null);
});

check("Edit package.json: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/package.json" } }) === null);
});

check("Edit scripts/test/ file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/scripts/test/test-foo.js" } }) === null);
});

// --- Home config file: passes ---

check("Edit ~/.claude/ file: passes", function() {
  var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: home + "/.claude/hooks/test.js" } }) === null);
});

// --- Project WITH tracked tasks: passes ---

check("Project with specs/feature/tasks.md containing T### checkboxes: passes", function() {
  delete process.env.SKIP_SPEC_GATE;
  delete process.env.CONTINUOUS_CLAUDE;
  var dir = createGitRepo("with-tasks");
  fs.mkdirSync(path.join(dir, "specs", "feature"), { recursive: true });
  fs.writeFileSync(path.join(dir, "specs", "feature", "tasks.md"), "- [ ] T001: Do something\n- [x] T002: Done\n");
  process.env.CLAUDE_PROJECT_DIR = dir;
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "src", "app.js") } }) === null);
});

check("Project with TODO.md containing T### checkboxes: passes", function() {
  delete process.env.SKIP_SPEC_GATE;
  delete process.env.CONTINUOUS_CLAUDE;
  var dir = createGitRepo("with-todo");
  fs.writeFileSync(path.join(dir, "TODO.md"), "- [ ] T100: Fix bug\n");
  process.env.CLAUDE_PROJECT_DIR = dir;
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "src", "app.js") } }) === null);
});

// --- Project WITHOUT tracked tasks: blocks ---

check("Project without tasks: blocks .js edit", function() {
  delete process.env.SKIP_SPEC_GATE;
  delete process.env.CONTINUOUS_CLAUDE;
  var dir = createGitRepo("no-tasks");
  process.env.CLAUDE_PROJECT_DIR = dir;
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "src", "app.js") } });
  assert(r && r.decision === "block", "should block when no tracked tasks");
  assert(r.reason.indexOf("TRACKED WORKFLOW") >= 0);
});

check("Project with empty specs dir: blocks", function() {
  delete process.env.SKIP_SPEC_GATE;
  delete process.env.CONTINUOUS_CLAUDE;
  var dir = createGitRepo("empty-specs");
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  process.env.CLAUDE_PROJECT_DIR = dir;
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: path.join(dir, "src", "new.js"), content: "x" } });
  assert(r && r.decision === "block");
});

// --- No git root: passes ---

check("File outside git repo: passes", function() {
  delete process.env.SKIP_SPEC_GATE;
  delete process.env.CONTINUOUS_CLAUDE;
  var dir = path.join(tmpBase, "no-git");
  fs.mkdirSync(dir, { recursive: true });
  process.env.CLAUDE_PROJECT_DIR = dir;
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: path.join(dir, "app.js") } }) === null);
});

// --- Edge cases ---

check("Empty file_path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "" } }) === null);
});

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: {} }) === null);
});

cleanup();

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
