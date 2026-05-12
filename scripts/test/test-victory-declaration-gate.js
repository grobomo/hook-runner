#!/usr/bin/env node
// CI-SKIP — requires _haiku-judge.js helper
"use strict";
var path = require("path");
var os = require("os");
var fs = require("fs");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/victory-declaration-gate.js"));

var EVIDENCE_PATH = path.join(os.tmpdir(), ".hook-runner-test-evidence.json");

var pass = 0, fail = 0, tests = [];
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

function callGate(cmd) {
  var r = gate({tool_name: "Bash", tool_input: {command: cmd}});
  if (r && typeof r.then === "function") return r;
  return Promise.resolve(r);
}

function addTest(name, fn) { tests.push({ name: name, fn: fn }); }

function runTests() {
  var i = 0;
  function next() {
    if (i >= tests.length) {
      try { fs.unlinkSync(EVIDENCE_PATH); } catch(e) {}
      console.log("\n" + pass + "/" + (pass+fail) + " passed");
      process.exit(fail > 0 ? 1 : 0);
      return;
    }
    var t = tests[i++];
    try {
      var result = t.fn();
      if (result && typeof result.then === "function") {
        result.then(function() { next(); }).catch(function(e) {
          fail++; console.log("FAIL: " + t.name + " (error: " + e.message + ")"); next();
        });
      } else { next(); }
    } catch(e) {
      fail++; console.log("FAIL: " + t.name + " (error: " + e.message + ")"); next();
    }
  }
  next();
}

// Clean up any existing evidence
try { fs.unlinkSync(EVIDENCE_PATH); } catch(e) {}

// Non-Bash ignored (sync path — returns null directly)
addTest("Read tool ignored", function() {
  ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
});

// Non-commit commands ignored (sync — returns null before regex)
addTest("echo allowed", function() {
  return callGate("echo all tests pass").then(function(r) { ok("echo allowed", r === null); });
});
addTest("git push allowed", function() {
  return callGate("git push origin main").then(function(r) { ok("git push allowed", r === null); });
});

// Victory words in commit messages blocked (no evidence, async via judge)
addTest("all tests pass blocked", function() {
  return callGate('git commit -m "all tests pass"').then(function(r) {
    ok("all tests pass blocked", r && r.decision === "block");
  });
});
addTest("all green blocked", function() {
  return callGate('git commit -m "All green"').then(function(r) {
    ok("all green blocked", r && r.decision === "block");
  });
});
addTest("completed successfully blocked", function() {
  return callGate('git commit -m "completed successfully"').then(function(r) {
    ok("completed successfully blocked", r && r.decision === "block");
  });
});
addTest("100% blocked", function() {
  return callGate('git commit -m "100% coverage achieved"').then(function(r) {
    ok("100% blocked", r && r.decision === "block");
  });
});

// Non-victory commits allowed (sync — regex doesn't match)
addTest("normal commit allowed", function() {
  return callGate('git commit -m "T613: Add tunnel-check-gate"').then(function(r) {
    ok("normal commit allowed", r === null);
  });
});
addTest("fix commit allowed", function() {
  return callGate('git commit -m "Fix bug in parser"').then(function(r) {
    ok("fix commit allowed", r === null);
  });
});

// T634: Historical references should NOT trigger
addTest("T634: bare completed allowed", function() {
  return callGate('git commit -m "T631: spec-gate worktree awareness — completed"').then(function(r) {
    ok("T634: bare completed allowed", r === null);
  });
});
addTest("T634: mark as completed allowed", function() {
  return callGate('git commit -m "tasks.md: mark T456 as completed"').then(function(r) {
    ok("T634: mark as completed allowed", r === null);
  });
});
addTest("T634: already completed allowed", function() {
  return callGate('git commit -m "Add retroactive tasks for completed PRs"').then(function(r) {
    ok("T634: already completed allowed", r === null);
  });
});
addTest("T634: all tasks completed blocked", function() {
  return callGate('git commit -m "all tasks completed"').then(function(r) {
    ok("T634: all tasks completed blocked", r && r.decision === "block");
  });
});
addTest("T634: all work completed blocked", function() {
  return callGate('git commit -m "All work completed"').then(function(r) {
    ok("T634: all work completed blocked", r && r.decision === "block");
  });
});

// Specific results in title allowed
addTest("specific results allowed", function() {
  return callGate('git commit -m "T442: 17/17 pass"').then(function(r) {
    ok("specific results allowed", r === null);
  });
});

// Victory words in body (not title) should pass
addTest("victory in body allowed", function() {
  return callGate("git commit -m \"$(cat <<'EOF'\nT442: Fix gate\n\nAll tests pass now\nEOF\n)\"").then(function(r) {
    ok("victory in body allowed", r === null);
  });
});

// With valid test evidence — victory claims allowed (sync: evidence check before judge)
addTest("with evidence: all tests pass allowed", function() {
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
    ts: Date.now(), passed: 29, failed: 0, summary: "29 passed, 0 failed"
  }));
  return callGate('git commit -m "all tests pass"').then(function(r) {
    ok("with evidence: all tests pass allowed", r === null);
  });
});

// With failed evidence — blocked (async via judge)
addTest("with failed evidence: blocked", function() {
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
    ts: Date.now(), passed: 28, failed: 1, summary: "28 passed, 1 failed"
  }));
  return callGate('git commit -m "all tests pass"').then(function(r) {
    ok("with failed evidence: blocked", r && r.decision === "block");
  });
});
addTest("failed evidence mentions failures", function() {
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
    ts: Date.now(), passed: 28, failed: 1, summary: "28 passed, 1 failed"
  }));
  return callGate('git commit -m "all tests pass"').then(function(r) {
    ok("failed evidence mentions failures", r && /failures/.test(r.reason));
  });
});

// Stale evidence (> 10 min) — blocked
addTest("stale evidence: blocked", function() {
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
    ts: Date.now() - 11 * 60 * 1000, passed: 29, failed: 0, summary: "29 passed, 0 failed"
  }));
  return callGate('git commit -m "all tests pass"').then(function(r) {
    ok("stale evidence: blocked", r && r.decision === "block");
  });
});

// Empty command
addTest("empty commit allowed", function() {
  return callGate("").then(function(r) { ok("empty commit allowed", r === null); });
});

// T637: Haiku judge integration
addTest("T637: gate requires _haiku-judge", function() {
  var src = fs.readFileSync(path.join(__dirname, "../../modules/PreToolUse/victory-declaration-gate.js"), "utf-8");
  ok("T637: gate requires _haiku-judge", src.indexOf("_haiku-judge") !== -1);
});
addTest("T637: gate calls judge with fallback block", function() {
  var src = fs.readFileSync(path.join(__dirname, "../../modules/PreToolUse/victory-declaration-gate.js"), "utf-8");
  ok("T637: gate calls judge with fallback block", src.indexOf('fallback: "block"') !== -1);
});
addTest("T637: gate returns Promise from judge", function() {
  try { fs.unlinkSync(EVIDENCE_PATH); } catch(e) {}
  var r = gate({tool_name: "Bash", tool_input: {command: 'git commit -m "all tests pass"'}});
  ok("T637: gate returns Promise from judge", r && typeof r.then === "function");
});

runTests();
