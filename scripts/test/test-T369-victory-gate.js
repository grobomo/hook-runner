#!/usr/bin/env node
"use strict";
// Test suite for victory-declaration-gate module (T369)
// T637: Updated to handle async returns from haiku-judge integration

var path = require("path");
var MOD = path.join(__dirname, "../../modules/PreToolUse/victory-declaration-gate.js");

var pass = 0, fail = 0, tests = [];
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var gate = require(MOD);

function callGate(input) {
  var r = gate(input);
  if (r && typeof r.then === "function") return r;
  return Promise.resolve(r);
}

function addTest(name, fn) { tests.push({ name: name, fn: fn }); }
function runTests() {
  var i = 0;
  function next() {
    if (i >= tests.length) {
      console.log("\n" + pass + "/" + (pass + fail) + " passed");
      process.exit(fail > 0 ? 1 : 0);
      return;
    }
    var t = tests[i++];
    try {
      var result = t.fn();
      if (result && typeof result.then === "function") {
        result.then(function() { next(); }).catch(function(e) {
          fail++; console.log("  FAIL: " + t.name + " (error: " + e.message + ")"); next();
        });
      } else { next(); }
    } catch(e) {
      fail++; console.log("  FAIL: " + t.name + " (error: " + e.message + ")"); next();
    }
  }
  console.log("=== hook-runner: victory-declaration-gate (T369) ===");
  next();
}

// 1. Non-Bash tool passes (sync — returns null directly)
addTest("non-Bash passes", function() {
  assert("non-Bash passes", gate({ tool_name: "Edit", tool_input: {} }) === null);
});

// 2. Non-commit bash passes
addTest("non-commit bash passes", function() {
  assert("non-commit bash passes", gate({ tool_name: "Bash", tool_input: { command: "echo hello" } }) === null);
});

// 3. Specific commit message passes
addTest("specific message with count passes", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "T442: Fix testbox gate — 17/17 tests pass, synced to live"' } })
    .then(function(r) { assert("specific message with count passes", r === null); });
});

// 4. "All tests pass" blocks
addTest("all tests pass blocks", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "All tests pass"' } })
    .then(function(r) { assert("all tests pass blocks", r && r.decision === "block"); });
});

// 5. "all green" blocks
addTest("all green blocks", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "Everything is all green now"' } })
    .then(function(r) { assert("all green blocks", r && r.decision === "block"); });
});

// 6. "completed successfully" blocks
addTest("completed successfully blocks", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "Task completed successfully"' } })
    .then(function(r) { assert("completed successfully blocks", r && r.decision === "block"); });
});

// 7. "100%" blocks
addTest("100% blocks", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "100% coverage achieved"' } })
    .then(function(r) { assert("100% blocks", r && r.decision === "block"); });
});

// 8. "zero failures" blocks
addTest("zero failures blocks", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "Deploy with zero failures"' } })
    .then(function(r) { assert("zero failures blocks", r && r.decision === "block"); });
});

// 9. Normal descriptive message passes
addTest("normal descriptive message passes", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "T370: Add unresolved-issues-gate module with 12 test cases"' } })
    .then(function(r) { assert("normal descriptive message passes", r === null); });
});

// 10. "succeeded" blocks
addTest("succeeded blocks", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "Deploy succeeded"' } })
    .then(function(r) { assert("succeeded blocks", r && r.decision === "block"); });
});

// 11. Heredoc message with victory words blocks
addTest("heredoc victory blocks", function() {
  var heredocCmd = 'git commit -m "$(cat <<\'EOF\'\nAll tests passed and everything works\nEOF\n)"';
  return callGate({ tool_name: "Bash", tool_input: { command: heredocCmd } })
    .then(function(r) { assert("heredoc victory blocks", r && r.decision === "block"); });
});

// 12. Block message includes guidance
addTest("block has verification checklist", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "All tests pass"' } })
    .then(function(r) {
      assert("block has verification checklist", r && r.reason &&
        (r.reason.indexOf("Run tests") !== -1 || r.reason.indexOf("evidence") !== -1 ||
         r.reason.indexOf("verify") !== -1 || r.reason.indexOf("VERIFY") !== -1));
    });
});
addTest("block has rephrase guidance", function() {
  return callGate({ tool_name: "Bash", tool_input: { command: 'git commit -m "All tests pass"' } })
    .then(function(r) {
      assert("block has actionable guidance", r && r.reason &&
        /WHY:|NEXT STEPS:|rephrase|GOOD/i.test(r.reason));
    });
});

// 14. Victory words in body (not title) should pass
addTest("victory words in body only passes", function() {
  var bodyCmd = 'git commit -m "$(cat <<\'EOF\'\nT369: Add victory-declaration gate\n\nBlocks messages like all tests pass or all green in the title line.\nEOF\n)"';
  return callGate({ tool_name: "Bash", tool_input: { command: bodyCmd } })
    .then(function(r) { assert("victory words in body only passes", r === null); });
});

// 15. Victory words in title of heredoc still blocks
addTest("victory words in heredoc title blocks", function() {
  var titleVictoryCmd = 'git commit -m "$(cat <<\'EOF\'\nAll tests pass — ship it\n\nDetails here.\nEOF\n)"';
  return callGate({ tool_name: "Bash", tool_input: { command: titleVictoryCmd } })
    .then(function(r) { assert("victory words in heredoc title blocks", r && r.decision === "block"); });
});

runTests();
