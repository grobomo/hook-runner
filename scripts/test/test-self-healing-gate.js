#!/usr/bin/env node
"use strict";
// Tests for self-healing-gate.js (T807)
// Verifies: detects issues from hook-log, classifies, writes findings file

var fs = require("fs");
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { passed++; console.log("  PASS:", label); }
  else { failed++; console.error("  FAIL:", label); }
}

// Isolate
var tmpDir = path.join(os.tmpdir(), "test-self-healing-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
var hooksDir = path.join(tmpDir, ".claude", "hooks");
fs.mkdirSync(hooksDir, { recursive: true });
var healingDir = path.join(hooksDir, "self-healing");
fs.mkdirSync(healingDir, { recursive: true });

var origHome = process.env.HOME;
var origUserProfile = process.env.USERPROFILE;
var origTest = process.env.HOOK_RUNNER_TEST;

process.env.HOME = tmpDir;
process.env.USERPROFILE = tmpDir;
// Do NOT set HOOK_RUNNER_TEST=1 — that makes the module return null

var HOOK_LOG = path.join(hooksDir, "hook-log.jsonl");
var FINDINGS = path.join(hooksDir, ".self-healing-findings.json");

console.log("=== T807: self-healing-gate ===\n");

// --- Module contract ---
console.log("--- Module contract ---");

// With test flag, returns null
process.env.HOOK_RUNNER_TEST = "1";
var gate = require("../../modules/Stop/self-healing-gate");
ok("exports a function", typeof gate === "function");
ok("returns null when HOOK_RUNNER_TEST=1", gate({}) === null);
delete process.env.HOOK_RUNNER_TEST;

// Need to re-require to get fresh module without test flag
delete require.cache[require.resolve("../../modules/Stop/self-healing-gate")];
gate = require("../../modules/Stop/self-healing-gate");

// --- No issues (healthy) ---
console.log("\n--- No issues ---");
fs.writeFileSync(HOOK_LOG, "");
var r1 = gate({});
ok("returns block decision (SELF-CHECK format)", r1 && r1.decision === "block");
ok("mentions healthy/DONE when no issues", r1 && /healthy|DONE/i.test(r1.reason));

// --- Module errors detected ---
console.log("\n--- Issue detection ---");
var errorEntries = [
  JSON.stringify({ ts: new Date().toISOString(), module: "broken-gate", result: "error", error: "Cannot find module './missing'" }),
  JSON.stringify({ ts: new Date().toISOString(), module: "slow-gate", ms: 3500, event: "PreToolUse" }),
  JSON.stringify({ ts: new Date().toISOString(), module: "runner", event: "Stop", user_prompt: "(not available)" })
].join("\n") + "\n";
fs.writeFileSync(HOOK_LOG, errorEntries);

var r2 = gate({});
ok("detects issues from hook log", r2 && r2.decision === "block");
ok("reports issue count", r2 && /issue\(s\) detected/.test(r2.reason));

// --- Findings file written (T807) ---
console.log("\n--- Findings file (T807) ---");
ok("findings file created", fs.existsSync(FINDINGS));

try {
  var findings = JSON.parse(fs.readFileSync(FINDINGS, "utf-8"));
  ok("findings has timestamp", typeof findings.ts === "string");
  ok("findings has total count", typeof findings.total === "number" && findings.total > 0);
  ok("findings has issues array", Array.isArray(findings.issues));
  ok("findings issues have category path", findings.issues.length > 0 && findings.issues[0].path);
  ok("findings issues have detail", findings.issues.length > 0 && findings.issues[0].detail);
} catch (e) {
  ok("findings file valid JSON", false);
  ok("findings structure", false);
  ok("findings issues", false);
  ok("findings path", false);
  ok("findings detail", false);
}

// --- Lesson storage ---
console.log("\n--- Lesson storage ---");
var lessonsDir = path.join(healingDir, "lessons");
ok("lessons directory created", fs.existsSync(lessonsDir));

var indexPath = path.join(healingDir, "index.json");
ok("index.json created", fs.existsSync(indexPath));

try {
  var index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  var keys = Object.keys(index).filter(function(k) { return k.indexOf("_stats") === -1; });
  ok("index has lesson entries", keys.length > 0);
} catch (e) {
  ok("index parseable", false);
}

// --- CLI ---
console.log("\n--- CLI ---");
var cp = require("child_process");
var modulePath = path.resolve("modules/Stop/self-healing-gate.js");
try {
  var statusOut = cp.execFileSync("node", [modulePath, "status"], {
    encoding: "utf-8",
    timeout: 5000,
    env: Object.assign({}, process.env, { HOME: tmpDir, USERPROFILE: tmpDir }),
    windowsHide: true
  });
  ok("CLI status command runs", statusOut.indexOf("Self-Healing") >= 0);
} catch (e) {
  ok("CLI status command runs", false);
}

// Cleanup
process.env.HOME = origHome;
if (origUserProfile !== undefined) process.env.USERPROFILE = origUserProfile;
else delete process.env.USERPROFILE;
if (origTest !== undefined) process.env.HOOK_RUNNER_TEST = origTest;
else delete process.env.HOOK_RUNNER_TEST;
try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
