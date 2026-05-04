#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/force-push-gate.js"));

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

// Non-Bash tools ignored
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Edit tool ignored", gate({tool_name: "Edit", tool_input: {}}) === null);

// Normal push allowed
ok("git push (no force) passes", passes("git push origin main"));
ok("git push -u passes", passes("git push -u origin feature"));

// Force push to main/master blocked
ok("--force to main blocked", blocks("git push --force origin main"));
ok("-f to main blocked", blocks("git push -f origin main"));
ok("--force to master blocked", blocks("git push --force origin master"));
ok("--force-with-lease to main blocked", blocks("git push --force-with-lease origin main"));

// Force push to other branches allowed
ok("--force to feature passes", passes("git push --force origin feature-branch"));
ok("-f to develop passes", passes("git push -f origin develop"));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "git push --force origin main"}});
ok("block mentions destructive", r && /destructive/i.test(r.reason));
ok("block mentions revert", r && /revert/i.test(r.reason));

// Edge cases
ok("empty command passes", passes(""));
ok("non-git command passes", passes("echo hello"));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
