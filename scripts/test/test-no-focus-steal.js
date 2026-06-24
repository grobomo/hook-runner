#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/no-focus-steal.js"));

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

if (process.platform !== "win32") {
  // On non-Windows, everything passes
  ok("non-win32: background node passes", passes("node script.js &"));
  ok("non-win32: nohup passes", passes("nohup python worker.py &"));
  console.log("\n" + pass + "/" + (pass+fail) + " passed (non-Windows: all pass)");
  process.exit(fail > 0 ? 1 : 0);
}

// Windows tests below

// Background process spawning blocked
ok("node &amp blocked", blocks("node script.js &"));
ok("nohup python blocked", blocks("nohup python worker.py &"));
ok("nohup bash blocked", blocks("nohup bash deploy.sh &"));
ok("start exe blocked", blocks('start "" python.exe script.py'));
ok("start cmd blocked", blocks('start "" cmd /c script.bat'));
ok("start claude blocked", blocks('start "" claude -p "test"'));

// File opens allowed
ok("start pdf allowed", passes('start "" "report.pdf"'));
ok("start html allowed", passes('start "" "index.html"'));
ok("start png allowed", passes('start "" "screenshot.png"'));
ok("start txt allowed", passes('start "" "notes.txt"'));
ok("start xlsx allowed", passes('start "" "data.xlsx"'));

// Normal commands allowed
ok("echo allowed", passes("echo hello"));
ok("node inline allowed", passes("node -e 'console.log(1)'"));
ok("git allowed", passes("git status"));
ok("empty command allowed", passes(""));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "node script.js &"}});
ok("block mentions focus/background", r && /focus|background|visible/i.test(r.reason));
ok("block has WHY + NEXT STEPS", r && /WHY:/.test(r.reason) && /NEXT STEPS:/i.test(r.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
