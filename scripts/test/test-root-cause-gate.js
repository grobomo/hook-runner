#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/root-cause-gate.js"));

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

// Cleanup patterns blocked
ok("git reset --hard blocked", blocks("git reset --hard"));
ok("git checkout -- . blocked", blocks("git checkout -- ."));
ok("rm -rf requests/ blocked", blocks("rm -rf requests/"));
ok("mv requests/failed blocked", blocks("mv file requests/failed"));
ok("mv dispatched archived blocked", blocks("mv requests/dispatched archived"));

// Recovery commands allowed (rebase/merge abort are NOT blocked)
ok("git rebase --abort allowed", passes("git rebase --abort"));
ok("git merge --abort allowed", passes("git merge --abort"));

// Normal commands allowed
ok("git commit allowed", passes("git commit -m 'fix'"));
ok("git push allowed", passes("git push origin main"));
ok("echo allowed", passes("echo hello"));
ok("empty command allowed", passes(""));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "git reset --hard"}});
ok("block mentions root cause", r && /root cause/i.test(r.reason));
ok("block has WHY + NEXT STEPS", r && /WHY:/.test(r.reason) && /NEXT STEPS:/i.test(r.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
