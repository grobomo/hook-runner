#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/archive-not-delete.js"));

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

// Destructive commands blocked
ok("rm -rf blocked", blocks("rm -rf src/"));
ok("rm -fr blocked", blocks("rm -fr src/old/"));
ok("rm -r blocked", blocks("rm -r some-dir"));
ok("rm --recursive blocked", blocks("rm --recursive some-dir"));
ok("rmdir (plain) allowed - empty dirs only", passes("rmdir old-folder"));
ok("rmdir /s blocked - recursive delete", blocks("rmdir /s old-folder"));
ok("rmdir /S blocked - case insensitive", blocks("rmdir /S old-folder"));

// Exceptions allowed
ok("rm node_modules allowed", passes("rm -rf node_modules"));
ok("rm __pycache__ allowed", passes("rm -rf __pycache__"));
ok("rm .pyc allowed", passes("rm file.pyc"));
ok("rm .log allowed", passes("rm app.log"));
ok("rm .tmp allowed", passes("rm data.tmp"));
ok("rm .cache allowed", passes("rm -rf .cache"));
ok("rm /tmp/ allowed", passes("rm -rf /tmp/build"));
ok("rm dist/ allowed", passes("rm -rf dist/"));
ok("rm build/ allowed", passes("rm -rf build/"));
ok("git rm --cached allowed", passes("git rm --cached secret.env"));
ok("git rm -r --cached allowed", passes("git rm -r --cached .env/"));
ok("git lock file allowed", passes("rm .git/index.lock"));

// Normal commands allowed
ok("echo allowed", passes("echo hello"));
ok("mv allowed", passes("mv file.txt archive/"));
ok("cp allowed", passes("cp file.txt backup/"));
ok("empty command allowed", passes(""));

// Quoted strings should not trigger (commit messages)
ok("commit with rm in msg allowed", passes('git commit -m "remove old files with rm"'));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "rm -rf src/"}});
ok("block mentions archive", r && /archive/i.test(r.reason));
ok("block mentions move/archive alternative", r && /mov|archiv/i.test(r.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
