#!/usr/bin/env node
"use strict";
var path = require("path");
var os = require("os");
var fs = require("fs");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/victory-declaration-gate.js"));

var EVIDENCE_PATH = path.join(os.tmpdir(), ".hook-runner-test-evidence.json");

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function blocks(cmd) {
  var r = gate({tool_name: "Bash", tool_input: {command: cmd}});
  return r && r.decision === "block";
}
function passes(cmd) {
  return gate({tool_name: "Bash", tool_input: {command: cmd}}) === null;
}

// Clean up any existing evidence
try { fs.unlinkSync(EVIDENCE_PATH); } catch(e) {}

// Non-Bash ignored
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);

// Non-commit commands ignored
ok("echo allowed", passes("echo all tests pass"));
ok("git push allowed", passes("git push origin main"));

// Victory words in commit messages blocked (no evidence)
ok("all tests pass blocked", blocks('git commit -m "all tests pass"'));
ok("all green blocked", blocks('git commit -m "All green"'));
ok("completed successfully blocked", blocks('git commit -m "completed successfully"'));
ok("100% blocked", blocks('git commit -m "100% coverage achieved"'));

// Non-victory commits allowed
ok("normal commit allowed", passes('git commit -m "T613: Add tunnel-check-gate"'));
ok("fix commit allowed", passes('git commit -m "Fix bug in parser"'));

// Specific results in title allowed (not caught by VICTORY_WORDS)
ok("specific results allowed", passes('git commit -m "T442: 17/17 pass"'));

// Victory words in body (not title) should pass
ok("victory in body allowed", passes("git commit -m \"$(cat <<'EOF'\nT442: Fix gate\n\nAll tests pass now\nEOF\n)\""));

// With valid test evidence — victory claims allowed
fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
  ts: Date.now(),
  passed: 29,
  failed: 0,
  summary: "29 passed, 0 failed"
}));
ok("with evidence: all tests pass allowed", passes('git commit -m "all tests pass"'));

// With failed evidence — still blocked
fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
  ts: Date.now(),
  passed: 28,
  failed: 1,
  summary: "28 passed, 1 failed"
}));
ok("with failed evidence: blocked", blocks('git commit -m "all tests pass"'));
var r = gate({tool_name: "Bash", tool_input: {command: 'git commit -m "all tests pass"'}});
ok("failed evidence mentions failures", r && /failures/.test(r.reason));

// Stale evidence (> 10 min) — blocked
fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
  ts: Date.now() - 11 * 60 * 1000,
  passed: 29,
  failed: 0,
  summary: "29 passed, 0 failed"
}));
ok("stale evidence: blocked", blocks('git commit -m "all tests pass"'));

// Empty command
ok("empty commit allowed", passes(""));

// Clean up
try { fs.unlinkSync(EVIDENCE_PATH); } catch(e) {}

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
