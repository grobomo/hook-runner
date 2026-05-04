#!/usr/bin/env node
"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function blocks(r) { return r && r.decision === "block"; }

// Setup: create a fake project dir with sibling projects
var tmpRoot = path.join(os.tmpdir(), "xproj-test-" + Date.now());
var projectDir = path.join(tmpRoot, "my-project");
var siblingDir = path.join(tmpRoot, "other-project");
fs.mkdirSync(projectDir, {recursive: true});
fs.mkdirSync(siblingDir, {recursive: true});
fs.writeFileSync(path.join(siblingDir, "TODO.md"), "# Other\n");

var origProjectDir = process.env.CLAUDE_PROJECT_DIR;
var origProjectsRoot = process.env.CLAUDE_PROJECTS_ROOT;

// Set env BEFORE requiring module — PROJECTS_ROOT is read at load time
process.env.CLAUDE_PROJECT_DIR = projectDir.replace(/\\/g, "/");
process.env.CLAUDE_PROJECTS_ROOT = tmpRoot.replace(/\\/g, "/");

var modPath = path.join(__dirname, "../../modules/PreToolUse/cross-project-todo-gate.js");
delete require.cache[require.resolve(modPath)];
var gate = require(modPath);

var todoPath = path.join(projectDir, "TODO.md").replace(/\\/g, "/");

function editTodo(content) {
  return gate({tool_name: "Edit", tool_input: {file_path: todoPath, new_string: content}});
}
function writeTodo(content) {
  return gate({tool_name: "Write", tool_input: {file_path: todoPath, content: content}});
}

// --- Tool filtering ---
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Bash tool ignored", gate({tool_name: "Bash", tool_input: {command: "echo hi"}}) === null);

// --- Non-TODO.md files ignored ---
ok("Edit app.js ignored", gate({tool_name: "Edit", tool_input: {file_path: path.join(projectDir, "app.js")}}) === null);

// --- Normal TODO content passes ---
ok("normal TODO passes", editTodo("- [ ] Fix the login bug\n- [ ] Add tests") === null);
ok("checked items pass", editTodo("- [x] cross-project work done") === null);
ok("prose passes", editTodo("This cross-project system is great") === null);
ok("empty content passes", editTodo("") === null);

// --- "cross-project" marker in unchecked TODO blocks ---
ok("cross-project marker blocks", blocks(editTodo("- [ ] cross-project fix needed for auth module")));
// But NOT compound words like workflow names
ok("cross-project-reset (compound) passes", editTodo("- [ ] Fix cross-project-reset workflow issue") === null);
ok("cross-project-todo-gate (compound) passes", editTodo("- [ ] Update cross-project-todo-gate tests") === null);

// --- "New project:" marker blocks ---
ok("New project: blocks", blocks(editTodo("- [ ] New project: build a dashboard")));
ok("new project setup blocks", blocks(editTodo("- [ ] new project setup for analytics")));

// --- Sibling path references block ---
ok("sibling path blocks", blocks(editTodo("- [ ] Fix bug in other-project/src/main.js")));
ok("sibling backslash blocks", blocks(editTodo("- [ ] Fix other-project\\config.json")));

// --- Cross-project work phrases block ---
ok("done in X needs blocks", blocks(editTodo("- [ ] done in hook-runner, needs commit there")));
ok("needs commit there blocks", blocks(editTodo("- [ ] needs commit in that repo")));
ok("in X/TODO blocks", blocks(editTodo("- [ ] Written in other-project/TODO already")));

// --- Checked items with cross-project content pass (only unchecked are gated) ---
ok("checked cross-project passes", editTodo("- [x] cross-project work completed") === null);

// --- Write tool also gated ---
ok("Write TODO with cross-project blocks", blocks(writeTodo("- [ ] cross-project migration task")));

// --- Indented sub-items of unchecked TODOs ---
ok("indented sub-item with cross-project blocks", blocks(editTodo("- [ ] Fix auth\n  cross-project dependency on other-project/")));

// --- Editing another project's TODO.md is NOT gated (only current project) ---
var otherTodo = path.join(siblingDir, "TODO.md").replace(/\\/g, "/");
ok("other project TODO not gated", gate({tool_name: "Edit", tool_input: {file_path: otherTodo, new_string: "- [ ] cross-project work"}}) === null);

// --- Block message quality ---
var r = editTodo("- [ ] cross-project fix for auth");
ok("block mentions cross-project-todo-gate", r && /cross-project-todo-gate/i.test(r.reason));
ok("block mentions DO THIS INSTEAD", r && /DO THIS INSTEAD/i.test(r.reason));

// --- No CLAUDE_PROJECT_DIR → passes ---
delete process.env.CLAUDE_PROJECT_DIR;
// Re-require to pick up missing CLAUDE_PROJECT_DIR
delete require.cache[require.resolve(modPath)];
var gate2 = require(modPath);
ok("no project dir passes", gate2({tool_name: "Edit", tool_input: {file_path: todoPath, new_string: "- [ ] cross-project"}}) === null);

// Cleanup
process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
process.env.CLAUDE_PROJECTS_ROOT = origProjectsRoot || "";
try { fs.rmSync(tmpRoot, {recursive: true, force: true}); } catch(e) {}

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
