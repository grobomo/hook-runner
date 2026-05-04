#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/inter-project-priority.js
// inter-project-priority reads TODO.md for XREF tags from other projects
// and surfaces them as P0 priority items.

var path = require("path");
var fs = require("fs");
var os = require("os");

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "inter-project-priority.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

// Set up a temp project dir with a TODO.md
var tmpDir = path.join(os.tmpdir(), "test-inter-proj-" + process.pid);
try { fs.mkdirSync(tmpDir, { recursive: true }); } catch(e) {}

var origProjectDir = process.env.CLAUDE_PROJECT_DIR;

function setTodo(content) {
  fs.writeFileSync(path.join(tmpDir, "TODO.md"), content);
  process.env.CLAUDE_PROJECT_DIR = tmpDir;
}

function cleanup() {
  process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";
}

// Re-require module each test to avoid stale state
function freshMod() {
  delete require.cache[require.resolve(MOD_PATH)];
  return require(MOD_PATH);
}

// --- No CLAUDE_PROJECT_DIR ---
process.env.CLAUDE_PROJECT_DIR = "";
var mod = freshMod();
var r1 = mod();
assert("Returns null when no project dir", r1 === null);

// --- No TODO.md ---
process.env.CLAUDE_PROJECT_DIR = tmpDir;
try { fs.unlinkSync(path.join(tmpDir, "TODO.md")); } catch(e) {}
var r2 = freshMod()();
assert("Returns null when no TODO.md", r2 === null);

// --- TODO.md with no XREF items ---
setTodo("# TODO\n- [ ] T100: Normal task\n- [x] T99: Done task\n");
var r3 = freshMod()();
assert("Returns null when no XREF tags", r3 === null);

// --- TODO.md with XREF items ---
setTodo(
  "# TODO\n" +
  "- [ ] T200: Fix bug in module A <!-- XREF:dd-lab:T150 2026-04-20 -->\n" +
  "- [x] T201: Already done <!-- XREF:ddei:T99 2026-04-19 -->\n" +
  "- [ ] T202: Another cross-project issue <!-- XREF:v1-helper:T300 2026-04-21 -->\n" +
  "- [ ] T203: Normal task without XREF\n"
);
var r4 = freshMod()();
assert("Returns text when XREF items exist", r4 !== null && typeof r4 === "object");
if (r4) {
  assert("Text mentions INTER-PROJECT", r4.text.indexOf("INTER-PROJECT") >= 0);
  assert("Text mentions P0", r4.text.indexOf("P0") >= 0);
  assert("Text mentions source project dd-lab", r4.text.indexOf("dd-lab") >= 0);
  assert("Text mentions source project v1-helper", r4.text.indexOf("v1-helper") >= 0);
  assert("Does not include checked items", r4.text.indexOf("T201") === -1);
  assert("Text mentions 2 pending items", r4.text.indexOf("2 pending") >= 0);
  assert("Does not block", r4.decision === undefined);
}

// --- TODO.md with Inbound Requests section ---
setTodo(
  "# TODO\n- [ ] T300: Normal task\n\n" +
  "## Inbound Requests\n" +
  "- [ ] T301: Fix crash from email-manager\n" +
  "- [x] T302: Done request\n"
);
var r5 = freshMod()();
assert("Finds items in Inbound Requests section", r5 !== null);
if (r5) {
  assert("Text mentions T301", r5.text.indexOf("T301") >= 0);
  assert("Does not mention checked T302", r5.text.indexOf("T302") === -1);
}

// --- All XREF items are checked ---
setTodo(
  "# TODO\n" +
  "- [x] T400: Done <!-- XREF:dd-lab:T150 2026-04-20 -->\n" +
  "- [x] T401: Also done <!-- XREF:v1-helper:T300 2026-04-21 -->\n"
);
var r6 = freshMod()();
assert("Returns null when all XREF items are checked", r6 === null);

// Cleanup
cleanup();
try {
  fs.readdirSync(tmpDir).forEach(function(f) { fs.unlinkSync(path.join(tmpDir, f)); });
  fs.rmdirSync(tmpDir);
} catch(e) {}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
