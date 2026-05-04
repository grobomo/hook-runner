#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/commit-quality-gate.js"));

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

// Non-Bash/non-commit ignored
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("non-commit Bash passes", passes("git status"));
ok("git push passes", passes("git push origin main"));

// Good commit messages pass
ok("descriptive message passes", passes('git commit -m "Fix spec-gate cache stale hasUnchecked when tasks.md edited"'));
ok("5-word message passes", passes('git commit -m "Add test coverage for gates"'));

// Heredoc messages
ok("heredoc message passes", passes("git commit -m \"$(cat <<'EOF'\nT608: Fix bash-write-patterns false positives on compound commands\nEOF\n)\""));

// Short messages blocked
ok("1-word blocked", blocks('git commit -m "fix"'));
ok("2-word blocked", blocks('git commit -m "fix stuff"'));
ok("3-word blocked", blocks('git commit -m "update the code"'));
ok("4-word blocked", blocks('git commit -m "fix the broken thing"'));

// Generic starts blocked (< 8 words)
ok("generic 'fix' start blocked", blocks('git commit -m "fix something in the module"'));
ok("generic 'update' start blocked", blocks('git commit -m "update the test file here"'));
ok("generic 'wip' start blocked", blocks('git commit -m "wip adding new feature"'));
ok("generic 'cleanup' blocked", blocks('git commit -m "cleanup old unused code"'));

// Generic start with enough detail passes (>= 8 words)
ok("generic with detail passes", passes('git commit -m "fix the spec-gate cache invalidation for tasks.md editing scenario"'));

// Amend skipped
ok("--amend skipped", passes('git commit --amend'));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: 'git commit -m "fix"'}});
ok("block mentions word count", r && /words/.test(r.reason));
ok("block mentions min", r && /min/.test(r.reason));

var r2 = gate({tool_name: "Bash", tool_input: {command: 'git commit -m "update the test suite for gates"'}});
ok("generic block mentions detail", r2 && /GENERIC/.test(r2.reason));

// Edge cases
ok("empty command passes", passes(""));
ok("commit without -m passes", passes("git commit"));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
