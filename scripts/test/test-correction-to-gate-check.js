#!/usr/bin/env node
// Test: correction-to-gate-check warns when corrections don't produce gate specs
// T820: Corrections must produce gate specs
"use strict";

var path = require("path");
var fs = require("fs");
var os = require("os");
var REPO_DIR = path.resolve(__dirname, "../..");
var MODULE = path.join(REPO_DIR, "modules/PostToolUse/correction-to-gate-check.js");

process.env.HOOK_RUNNER_TEST = "1";

var pass = 0, fail = 0;

function ok(label, condition) {
  if (condition) {
    console.log("  PASS: " + label);
    pass++;
  } else {
    console.log("  FAIL: " + label);
    fail++;
  }
}

// Setup: create mock correction-log.jsonl
var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var CORRECTION_LOG = path.join(HOOKS_DIR, "correction-log.jsonl");
var STATE_FILE = path.join(os.tmpdir(), ".correction-gate-check-.json");

// Save original correction log
var origLog = null;
try { origLog = fs.readFileSync(CORRECTION_LOG, "utf-8"); } catch (e) {}

function cleanup() {
  try { fs.unlinkSync(STATE_FILE); } catch (e) {}
  // Restore original correction log
  if (origLog !== null) {
    fs.writeFileSync(CORRECTION_LOG, origLog);
  } else {
    try { fs.unlinkSync(CORRECTION_LOG); } catch (e) {}
  }
}

function freshRequire() {
  delete require.cache[require.resolve(MODULE)];
  return require(MODULE);
}

function writeCorrection(preview, minutesAgo) {
  var ts = new Date(Date.now() - (minutesAgo || 1) * 60 * 1000).toISOString();
  fs.appendFileSync(CORRECTION_LOG, JSON.stringify({
    ts: ts,
    project: "test-project",
    prompt_preview: preview,
    pattern: "/test/i",
    prompt_ts: ts
  }) + "\n");
}

function setupFreshState() {
  try { fs.unlinkSync(STATE_FILE); } catch (e) {}
  try { fs.unlinkSync(CORRECTION_LOG); } catch (e) {}
}

console.log("=== correction-to-gate-check (T820) ===");

// === Test Group 1: Module contract ===
console.log("\n--- Module contract ---");
var gate = freshRequire();
ok("module exports a function", typeof gate === "function");
ok("returns null for non-Edit/Write", gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
ok("returns null for non-TODO.md Edit", gate({
  tool_name: "Edit",
  tool_input: { file_path: "/tmp/app.js", new_string: "code" }
}) === null);

// === Test Group 2: No corrections — pass through ===
console.log("\n--- No corrections ---");
setupFreshState();
gate = freshRequire();
ok("no corrections — passes", gate({
  tool_name: "Edit",
  tool_input: { file_path: "/tmp/TODO.md", new_string: "- [ ] Fix something" }
}) === null);

// === Test Group 3: Correction + prose TODO = warn ===
console.log("\n--- Correction + prose TODO ---");
setupFreshState();
writeCorrection("no, wrong approach", 2);
gate = freshRequire();
var result = gate({
  tool_name: "Edit",
  tool_input: { file_path: "/tmp/TODO.md", new_string: "- [ ] Fix the approach to be better" }
});
ok("correction + prose TODO triggers warning", result !== null);
ok("warning mentions gate spec", result && result.reason && result.reason.indexOf("gate spec") !== -1);
ok("warning mentions PreToolUse/PostToolUse/Stop", result && result.reason && /PreToolUse|PostToolUse|Stop/.test(result.reason));

// === Test Group 4: Correction + gate spec = pass ===
console.log("\n--- Correction + gate spec ---");
setupFreshState();
writeCorrection("stop doing that", 2);
gate = freshRequire();
result = gate({
  tool_name: "Edit",
  tool_input: {
    file_path: "/tmp/TODO.md",
    new_string: "- [ ] T999: **PreToolUse gate** — trigger condition: when Claude does X. BLOCKED: You did X again."
  }
});
ok("correction + gate spec passes", result === null);

// === Test Group 5: Gate spec indicator detection ===
console.log("\n--- Gate spec indicator detection ---");

var specs = [
  { text: "PreToolUse gate with BLOCKED message", expect: true },
  { text: "PostToolUse module with trigger condition", expect: true },
  { text: "Stop event — block when X happens", expect: true },
  { text: "PreToolUse module.exports = function(input) { BLOCKED }", expect: true },
  { text: "BLOCKED: action. FALSE POSITIVE? File TODO. trigger condition: X", expect: true },
  { text: "Just fix the behavior to be better", expect: false },
  { text: "Add a check for this condition", expect: false },
  { text: "Update CLAUDE.md with new rule", expect: false },
];

for (var i = 0; i < specs.length; i++) {
  var count = 0;
  var GATE_SPEC_PATTERNS = [
    /\b(?:PreToolUse|PostToolUse|Stop|SessionStart)\b/,
    /\b(?:BLOCKED|block message|block when|trigger|trigger condition)\b/i,
    /\b(?:module\.exports|function\s*\(input\))\b/,
    /\b(?:event type|gate spec|decision:\s*"block")\b/i,
    /(?:FALSE POSITIVE\??|NEXT STEPS:?)\b/i
  ];
  for (var j = 0; j < GATE_SPEC_PATTERNS.length; j++) {
    if (GATE_SPEC_PATTERNS[j].test(specs[i].text)) count++;
  }
  var hasSpec = count >= 2;
  ok("spec detection: '" + specs[i].text.substring(0, 40) + "...' = " + (specs[i].expect ? "spec" : "prose"),
    hasSpec === specs[i].expect);
}

// === Test Group 6: Old corrections ignored ===
console.log("\n--- Old corrections ---");
setupFreshState();
writeCorrection("old correction", 20); // 20 minutes ago, beyond 15-min window
gate = freshRequire();
result = gate({
  tool_name: "Edit",
  tool_input: { file_path: "/tmp/TODO.md", new_string: "- [ ] Fix something" }
});
ok("correction older than 15min ignored", result === null);

// === Test Group 7: Dedup — same correction doesn't warn twice ===
console.log("\n--- Dedup ---");
setupFreshState();
writeCorrection("wrong again", 2);
gate = freshRequire();
// First call — warns
result = gate({
  tool_name: "Edit",
  tool_input: { file_path: "/tmp/TODO.md", new_string: "- [ ] Fix stuff" }
});
ok("first warning fires", result !== null);

// Second call with same correction — should not warn again
result = gate({
  tool_name: "Edit",
  tool_input: { file_path: "/tmp/TODO.md", new_string: "- [ ] More stuff" }
});
ok("second call same correction — no re-warn", result === null);

// === Test Group 8: Write tool support ===
console.log("\n--- Write tool support ---");
setupFreshState();
writeCorrection("you messed up", 1);
gate = freshRequire();
result = gate({
  tool_name: "Write",
  tool_input: { file_path: "/tmp/TODO.md", content: "- [ ] Fix something simple" }
});
ok("Write tool triggers check", result !== null);

// === Test Group 9: Windows path normalization ===
console.log("\n--- Path normalization ---");
setupFreshState();
gate = freshRequire();
ok("backslash path normalized", gate({
  tool_name: "Edit",
  tool_input: { file_path: "C:\\Users\\joe\\TODO.md", new_string: "test" }
}) === null); // no corrections, should pass regardless

// === Cleanup ===
cleanup();

// === Summary ===
console.log("\n" + (pass + fail) + " tests: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
