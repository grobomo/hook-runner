#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/git-rebase-safety.js"));

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

// Non-Bash ignored
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);

// Rebase ours/theirs blocked
ok("rebase --ours blocked", blocks("git rebase --ours"));
ok("rebase --theirs blocked", blocks("git rebase --theirs"));
ok("checkout --ours blocked", blocks("git checkout --ours file.txt"));
ok("checkout --theirs blocked", blocks("git checkout --theirs file.txt"));

// Normal git commands allowed
ok("git rebase main allowed", passes("git rebase main"));
ok("git checkout main allowed", passes("git checkout main"));
ok("git commit allowed", passes("git commit -m 'test'"));
ok("git push allowed", passes("git push origin main"));

// Credential helper quoting
ok("single-quote credential blocked", blocks("git config credential.helper '!gh auth git-credential'"));
ok("double-quote credential allowed", passes('git config credential.helper "!gh auth git-credential"'));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "git rebase --theirs"}});
ok("block mentions rebase", r && /rebase|reverse/i.test(r.reason));
ok("block has WHY + NEXT STEPS", r && /WHY:/.test(r.reason) && /NEXT STEPS:/i.test(r.reason));

var r2 = gate({tool_name: "Bash", tool_input: {command: "git config credential.helper '!gh'"}});
ok("cred block mentions quotes", r2 && /quot/i.test(r2.reason));

// Empty command
ok("empty command allowed", passes(""));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
