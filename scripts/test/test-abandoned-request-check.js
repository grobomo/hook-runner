#!/usr/bin/env node
"use strict";
// Tests for abandoned-request-check.js (T744)
// Verifies: flags untracked requests at Stop time

var fs = require("fs");
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { passed++; console.log("  PASS:", label); }
  else { failed++; console.error("  FAIL:", label); }
}

// Set up isolated test env
var tmpDir = path.join(os.tmpdir(), "test-abandoned-req-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
var hooksDir = path.join(tmpDir, ".claude", "hooks");
fs.mkdirSync(hooksDir, { recursive: true });

var origHome = process.env.HOME;
var origUserProfile = process.env.USERPROFILE;
var origSession = process.env.CLAUDE_SESSION_ID;
var origProject = process.env.CLAUDE_PROJECT_DIR;

process.env.HOME = tmpDir;
process.env.USERPROFILE = tmpDir;
process.env.CLAUDE_SESSION_ID = "testabc1-1234";
process.env.CLAUDE_PROJECT_DIR = tmpDir;

var pendingFile = path.join(hooksDir, ".pending-requests-testabc1.json");
var todoPath = path.join(tmpDir, "TODO.md");

function writePending(requests, tsOverride) {
  fs.writeFileSync(pendingFile, JSON.stringify({
    requests: requests,
    ts: tsOverride || new Date().toISOString(),
    prompt_preview: "test"
  }));
}
function clearPending() { try { fs.unlinkSync(pendingFile); } catch (e) {} }
function writeTodo(content) { fs.writeFileSync(todoPath, content); }
function clearTodo() { try { fs.unlinkSync(todoPath); } catch (e) {} }

var gate = require("../../modules/Stop/2-mechanical/abandoned-request-check");

console.log("=== T744: abandoned-request-check ===\n");

// --- Module contract ---
console.log("--- Module contract ---");
ok("exports a function", typeof gate === "function");

// --- No pending file ---
console.log("\n--- No pending requests ---");
clearPending();
ok("returns null when no pending file", gate({}) === null);

// --- Empty requests ---
console.log("\n--- Empty requests ---");
writePending([]);
ok("returns null with empty requests array", gate({}) === null);

// --- Pending requests, no TODO.md ---
console.log("\n--- Pending requests without TODO.md ---");
clearTodo();
writePending(["fix the login bug", "add user auth"]);
var r1 = gate({});
ok("warns about pending requests", r1 && r1.decision === "block");
ok("mentions request count", r1 && /2 user request/.test(r1.reason));
ok("lists requests", r1 && /login bug/.test(r1.reason));
ok("has FALSE POSITIVE escape", r1 && /FALSE POSITIVE/.test(r1.reason));
ok("suggests TODO.md", r1 && /TODO\.md/.test(r1.reason));

// --- Pending requests, tracked in TODO.md ---
console.log("\n--- Requests tracked in TODO.md ---");
writePending(["fix the login bug", "add user authentication"]);
writeTodo("# TODO\n- [ ] T999: Fix the login bug\n- [ ] T1000: Add user authentication\n");
var r2 = gate({});
ok("returns null when all tracked", r2 === null);
ok("pending file cleaned up", !fs.existsSync(pendingFile));

// --- Partial tracking ---
console.log("\n--- Partial tracking ---");
writePending(["fix the login bug", "add email notifications"]);
writeTodo("# TODO\n- [ ] T999: Fix the login bug\n");
var r3 = gate({});
ok("warns about untracked requests", r3 && r3.decision === "block");
ok("only lists untracked ones", r3 && /email/.test(r3.reason) && !/login/.test(r3.reason));

// --- Expired requests ---
console.log("\n--- Expired requests ---");
var expired = new Date(Date.now() - 31 * 60 * 1000).toISOString();
writePending(["old request"], expired);
ok("returns null for expired requests", gate({}) === null);

// --- Edge cases ---
console.log("\n--- Edge cases ---");
fs.writeFileSync(pendingFile, "not json");
ok("returns null for malformed JSON", gate({}) === null);

writePending(["x"]);
clearTodo();
var r4 = gate({});
ok("handles single short request", r4 && r4.decision === "block");

// --- SELF-CHECK format ---
console.log("\n--- Output format ---");
writePending(["deploy the new gate"]);
clearTodo();
var r5 = gate({});
ok("uses SELF-CHECK format", r5 && /SELF-CHECK \[abandoned-requests\]/.test(r5.reason));
ok("suggests CONTINUE", r5 && /CONTINUE/.test(r5.reason));

// Cleanup
process.env.HOME = origHome;
if (origUserProfile !== undefined) process.env.USERPROFILE = origUserProfile;
else delete process.env.USERPROFILE;
if (origSession !== undefined) process.env.CLAUDE_SESSION_ID = origSession;
else delete process.env.CLAUDE_SESSION_ID;
if (origProject !== undefined) process.env.CLAUDE_PROJECT_DIR = origProject;
else delete process.env.CLAUDE_PROJECT_DIR;
clearPending(); clearTodo();
try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
