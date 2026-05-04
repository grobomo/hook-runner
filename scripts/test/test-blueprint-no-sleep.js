#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/blueprint-no-sleep.js"));

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

// Blocks sleep > 1s
ok("sleep 5 blocked", blocks("sleep 5"));
ok("sleep 10 blocked", blocks("sleep 10"));
ok("sleep 30 blocked", blocks("sleep 30"));

// Allows sleep <= 1s
ok("sleep 1 allowed", passes("sleep 1"));
ok("sleep 0 allowed", passes("sleep 0"));

// Allows non-sleep commands
ok("echo allowed", passes("echo hello"));
ok("node command allowed", passes("node setup.js --test"));
ok("empty command allowed", passes(""));

// Allows commands with sleep in name but not standalone
ok("non-numeric sleep allowed", passes("sleep"));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "sleep 5"}});
ok("block mentions performance", r && /PERFORMANCE/i.test(r.reason));
ok("block mentions 3-10s", r && /3-10s/.test(r.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
