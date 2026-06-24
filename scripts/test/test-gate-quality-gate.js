#!/usr/bin/env node
"use strict";
// Tests for gate-quality-gate.js — enforces quality standards on gate creation/editing
var fs = require("fs");
var path = require("path");
var os = require("os");

var PASS = 0, FAIL = 0;
function pass(msg) { console.log("  PASS: " + msg); PASS++; }
function fail(msg) { console.log("  FAIL: " + msg); FAIL++; }

var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "gate-quality-gate.js");
function freshLoad() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var hookBase = path.join(HOME, ".claude", "hooks", "run-modules");
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gqg-test-"));
process.on("exit", function() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
});

// Well-formed gate content for testing
var GOOD_CONTENT = [
  "// TOOLS: Bash",
  "// WORKFLOW: starter",
  "// WHY: Testing showed that unchecked gates break silently.",
  "//",
  "// \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
  "// \u2502 TEST GATE \u2014 validates test behavior                  \u2502",
  "// \u2502 INCIDENT HISTORY:                                    \u2502",
  "// \u2502 2026-01-01: initial incident                         \u2502",
  "// \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
  '"use strict";',
  'var LOG_PATH = require("path").join(process.env.HOME || "", ".claude", "hooks", "hook-log.jsonl");',
  'function _log(e) { try { require("fs").appendFileSync(LOG_PATH, JSON.stringify(e)+"\\n"); } catch(x) {} }',
  'module.exports = function(input) { return null; };'
].join("\n");

console.log("=== gate-quality-gate tests ===\n");

// --- Module contract ---
console.log("--- Module contract ---");
var gate = freshLoad();
if (typeof gate === "function") pass("exports a function");
else fail("should export a function");

// --- Passthrough ---
console.log("\n--- Passthrough for non-hook files ---");
gate = freshLoad();
var r = gate({ tool_name: "Write", tool_input: { file_path: path.join(tmpDir, "not-a-hook.js"), content: "x" } });
if (r === null) pass("non-hook Write passes");
else fail("non-hook Write should pass");

r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(tmpDir, "app.js"), old_string: "a", new_string: "b" } });
if (r === null) pass("non-hook Edit passes");
else fail("non-hook Edit should pass");

r = gate({ tool_name: "Read", tool_input: { file_path: path.join(hookBase, "PreToolUse", "some-gate.js") } });
if (r === null) pass("Read tool passes");
else fail("Read tool should always pass");

r = gate({ tool_name: "Bash", tool_input: { command: "ls " + tmpDir } });
if (r === null) pass("Bash not touching hooks passes");
else fail("Bash not touching hooks should pass");

// --- Bash detection ---
console.log("\n--- Bash: blocks writes to hooks/run-modules ---");
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "python3 -c 'open(\"/.claude/hooks/run-modules/PreToolUse/bad.js\", \"w\")'" } });
if (r && r.decision === "block") pass("Bash python open() to hook dir blocked");
else fail("Bash python open() to hook dir should block");

gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "sed -i 's/x/y/' /.claude/hooks/run-modules/PreToolUse/some-gate.js" } });
if (r && r.decision === "block") pass("Bash sed -i to hook dir blocked");
else fail("Bash sed -i to hook dir should block");

// --- Bash: allows from hook-runner project ---
console.log("\n--- Bash: allows mv/cp from hook-runner project ---");
process.env.CLAUDE_PROJECT_DIR = path.join(tmpDir, "hook-runner");
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "cp modules/PreToolUse/x.js /.claude/hooks/run-modules/PreToolUse/x.js" } });
if (r === null) pass("cp from hook-runner project allowed");
else fail("cp from hook-runner should be allowed");

gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "mv /.claude/hooks/run-modules/PreToolUse/x.js.pending /.claude/hooks/run-modules/PreToolUse/x.js" } });
if (r === null) pass("mv .pending to .js from hook-runner allowed");
else fail("mv .pending should be allowed from hook-runner");
delete process.env.CLAUDE_PROJECT_DIR;

// --- Bash: allows .pending rename ---
console.log("\n--- Bash: allows .pending rename (verification workflow) ---");
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "mv /hooks/run-modules/PreToolUse/gate.js.pending /hooks/run-modules/PreToolUse/gate.js" } });
if (r === null) pass(".pending to .js rename allowed");
else fail(".pending to .js rename should be allowed");

// --- Bash: allows non-.js operations ---
console.log("\n--- Bash: allows non-.js in hook dir ---");
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "cp data.json /.claude/hooks/run-modules/PreToolUse/data.json" } });
if (r === null) pass("non-.js copy to hook dir allowed");
else fail("non-.js should be allowed");

// --- Write: naming convention ---
console.log("\n--- Write: naming convention ---");
gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: { file_path: path.join(hookBase, "PreToolUse", "bad-name.js"), content: GOOD_CONTENT } });
if (r && r.decision === "block" && r.reason.indexOf("naming") !== -1) pass("non-standard name blocked");
else fail("non-standard name should be blocked: " + JSON.stringify(r));

gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: { file_path: path.join(hookBase, "PreToolUse", "my-feature-gate.js"), content: GOOD_CONTENT } });
// New files to LIVE hooks trigger .pending workflow — this is a separate check
// Just verify the naming check passes (the .pending block is expected)
if (r === null || (r && r.reason.indexOf("naming") === -1)) pass("-gate.js name passes naming check");
else fail("-gate.js name should pass naming check");

gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: { file_path: path.join(hookBase, "PreToolUse", "_helper.js"), content: "x" } });
if (r === null) pass("helper (_prefix) name allowed without checks");
else fail("helper should skip all checks");

// --- Write: metadata enforcement (use hook-runner/modules/ path to avoid .pending check) ---
console.log("\n--- Write: metadata enforcement ---");
gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: {
  file_path: path.join(tmpDir, "hook-runner", "modules", "PreToolUse", "bare-gate.js"),
  content: '"use strict";\nmodule.exports = function(input) { return null; };'
} });
if (r && r.decision === "block") pass("bare module missing metadata blocked");
else fail("bare module should be blocked for missing metadata");

// Check which issues are flagged
if (r && r.reason.indexOf("WHY") !== -1) pass("missing WHY flagged");
else fail("should flag missing WHY");
if (r && r.reason.indexOf("TOOLS") !== -1) pass("missing TOOLS flagged");
else fail("should flag missing TOOLS");
if (r && r.reason.indexOf("INCIDENT") !== -1) pass("missing INCIDENT HISTORY flagged");
else fail("should flag missing INCIDENT HISTORY");
if (r && (r.reason.indexOf("logging") !== -1 || r.reason.indexOf("hook-log") !== -1)) pass("missing logging flagged");
else fail("should flag missing logging");

// --- Write: good content passes (repo path, not live path) ---
console.log("\n--- Write: well-formed gate passes ---");
gate = freshLoad();
r = gate({ tool_name: "Write", tool_input: {
  file_path: path.join(tmpDir, "hook-runner", "modules", "PreToolUse", "well-formed-gate.js"),
  content: GOOD_CONTENT
} });
if (r === null) pass("well-formed gate in repo modules/ passes");
else fail("well-formed gate should pass: " + JSON.stringify(r));

// --- Edit: WHY protection ---
console.log("\n--- Edit: protects WHY comment ---");
gate = freshLoad();
r = gate({ tool_name: "Edit", tool_input: {
  file_path: path.join(hookBase, "PreToolUse", "some-gate.js"),
  old_string: "// WHY: Important reason here",
  new_string: "// This does stuff"
} });
if (r && r.decision === "block") pass("removing WHY comment blocked");
else fail("removing WHY should be blocked");

// --- Edit: TOOLS protection ---
console.log("\n--- Edit: protects TOOLS tag ---");
gate = freshLoad();
r = gate({ tool_name: "Edit", tool_input: {
  file_path: path.join(hookBase, "PreToolUse", "some-gate.js"),
  old_string: "// TOOLS: Bash, Edit",
  new_string: "// handles bash and edit"
} });
if (r && r.decision === "block") pass("removing TOOLS tag blocked");
else fail("removing TOOLS should be blocked");

// --- Edit: normal edits pass ---
console.log("\n--- Edit: normal edits pass ---");
gate = freshLoad();
r = gate({ tool_name: "Edit", tool_input: {
  file_path: path.join(hookBase, "PreToolUse", "some-gate.js"),
  old_string: "var x = 1;",
  new_string: "var x = 2;"
} });
if (r === null) pass("normal code edit passes");
else fail("normal code edit should pass");

// --- Block message format ---
console.log("\n--- Block message format ---");
gate = freshLoad();
r = gate({ tool_name: "Bash", tool_input: { command: "tee /.claude/hooks/run-modules/PreToolUse/bad.js" } });
if (r && r.reason.indexOf("BLOCKED:") !== -1) pass("block message has BLOCKED:");
else fail("block message should have BLOCKED:");
if (r && r.reason.indexOf("FALSE POSITIVE") !== -1) pass("block message has FALSE POSITIVE escape");
else fail("block message should have FALSE POSITIVE escape");

console.log("\n=== Results: " + PASS + " passed, " + FAIL + " failed ===");
process.exit(FAIL > 0 ? 1 : 0);
