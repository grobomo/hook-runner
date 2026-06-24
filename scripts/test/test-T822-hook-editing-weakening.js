#!/usr/bin/env node
"use strict";
// T822: Test hook-editing-gate weakening detector fixes
// Bug 1: WHY field showed [object Object] instead of reason string
// Bug 2: "// never block" comment triggered false positive
var path = require("path");
var os = require("os");
var fs = require("fs");

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name); console.log("  " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "PreToolUse", "hook-editing-gate.js");
var HOME = os.homedir();

function freshGate() {
  delete require.cache[require.resolve(MOD_PATH)];
  process.env.CLAUDE_PROJECT_DIR = path.join(__dirname, "..", "..");
  return require(MOD_PATH);
}

function modulePath(event, name) {
  return path.join(HOME, ".claude", "hooks", "run-modules", event, name);
}

// --- Bug 1: [object Object] in WHY field ---
test("WHY field shows reason string, not [object Object]", function() {
  var gate = freshGate();
  // Module with enforcement-like code but no block decision
  var content = [
    "// TOOLS: Bash",
    "// WORKFLOW: starter",
    "// WHY: test",
    'var x = require("fs");',
    "function blockBadStuff() {",
    "  return null;",
    "}",
    "module.exports = function(input) {",
    "  var r = blockBadStuff();",
    "  return r;",
    "};",
    ""
  ].join("\n");
  var r = gate({
    tool_name: "Write",
    tool_input: { file_path: modulePath("PreToolUse", "test-gate.js.pending"), content: content }
  });
  assert(r && r.decision === "block", "should block");
  assert(r.reason.indexOf("[object Object]") === -1, "WHY field has [object Object]: " + r.reason.substring(0, 300));
  assert(r.reason.indexOf("no block decisions found") !== -1 || r.reason.indexOf("enforcement") !== -1,
    "should mention missing blocks");
});

// --- Bug 2: "// never block" comment false positive ---
test("non-blocking module with '// never block' comment passes", function() {
  var gate = freshGate();
  var content = [
    "// TOOLS: Edit",
    "// WORKFLOW: starter",
    "// WHY: test monitoring module",
    '"use strict";',
    'var fs = require("fs");',
    "module.exports = function(input) {",
    "  if (input.tool_name !== 'Edit') return null;",
    "  process.stderr.write('reminder\\n');",
    "  return null; // never block",
    "};",
    ""
  ].join("\n");
  var r = gate({
    tool_name: "Write",
    tool_input: { file_path: modulePath("PostToolUse", "test-check.js.pending"), content: content }
  });
  assert(r === null, "should pass but got: " + (r ? r.reason.substring(0, 200) : "null"));
});

test("git-commit-reminder-check.js passes weakening detector", function() {
  var gate = freshGate();
  var modFile = path.join(__dirname, "..", "..", "modules", "PostToolUse", "git-commit-reminder-check.js");
  var content = fs.readFileSync(modFile, "utf-8");
  var r = gate({
    tool_name: "Write",
    tool_input: { file_path: modulePath("PostToolUse", "git-commit-reminder-check.js.pending"), content: content }
  });
  assert(r === null, "should pass but got: " + (r ? r.reason.substring(0, 200) : "null"));
});

// --- Existing behavior preserved ---
test("module with 'gate' in code (not comments) still caught", function() {
  var gate = freshGate();
  // Must be > 10 lines to trigger the weakening check
  var content = [
    "// TOOLS: Bash",
    "// WORKFLOW: starter",
    "// WHY: test enforcement module",
    '"use strict";',
    'var fs = require("fs");',
    'var path = require("path");',
    'var gateName = "my-gate";',
    "module.exports = function(input) {",
    "  var tool = input.tool_name;",
    "  if (tool !== 'Bash') return null;",
    "  console.log(gateName);",
    "  return null;",
    "};",
    ""
  ].join("\n");
  var r = gate({
    tool_name: "Write",
    tool_input: { file_path: modulePath("PreToolUse", "test-gate.js.pending"), content: content }
  });
  assert(r && r.decision === "block", "should block module with 'gate' in code but no block decision");
});

test("module with 'enforce' in code (not comments) still caught", function() {
  var gate = freshGate();
  // Must be > 10 lines to trigger the weakening check
  var content = [
    "// TOOLS: Bash",
    "// WORKFLOW: starter",
    "// WHY: test enforcement module",
    '"use strict";',
    'var fs = require("fs");',
    'var path = require("path");',
    "function enforcePolicy() { return null; }",
    "module.exports = function(input) {",
    "  var tool = input.tool_name;",
    "  if (tool !== 'Bash') return null;",
    "  return enforcePolicy();",
    "};",
    ""
  ].join("\n");
  var r = gate({
    tool_name: "Write",
    tool_input: { file_path: modulePath("PreToolUse", "test-gate.js.pending"), content: content }
  });
  assert(r && r.decision === "block", "should block module with 'enforce' in code but no block decision");
});

test("module with block decision passes", function() {
  var gate = freshGate();
  var content = [
    "// TOOLS: Bash",
    "// WORKFLOW: starter",
    "// WHY: test",
    "module.exports = function(input) {",
    '  if (bad) return { decision: "block", reason: "nope" };',
    "  return null;",
    "};",
    ""
  ].join("\n");
  var r = gate({
    tool_name: "Write",
    tool_input: { file_path: modulePath("PreToolUse", "test-gate.js.pending"), content: content }
  });
  assert(r === null, "module with block decision should pass");
});

test("'block' only in comments does NOT trigger", function() {
  var gate = freshGate();
  var content = [
    "// TOOLS: Edit",
    "// WORKFLOW: starter",
    "// WHY: This module should never block anything",
    "// It just monitors and logs when blocked actions occur",
    "module.exports = function(input) {",
    "  process.stderr.write('checked\\n');",
    "  return null;",
    "};",
    ""
  ].join("\n");
  var r = gate({
    tool_name: "Write",
    tool_input: { file_path: modulePath("PostToolUse", "monitor-check.js.pending"), content: content }
  });
  assert(r === null, "block only in comments should pass but got: " + (r ? r.reason.substring(0, 200) : "null"));
});

// --- process.exit(0) check still works ---
test("process.exit(0) still caught", function() {
  var gate = freshGate();
  var content = [
    "// TOOLS: Bash",
    "// WORKFLOW: starter",
    "// WHY: test",
    "module.exports = function(input) { return null; };",
    "process.exit(0);",
    ""
  ].join("\n");
  var r = gate({
    tool_name: "Write",
    tool_input: { file_path: modulePath("PreToolUse", "test-gate.js.pending"), content: content }
  });
  assert(r && r.decision === "block", "process.exit(0) should be caught");
});

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);
