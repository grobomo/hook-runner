#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/process-kill-gate.js"));

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

// Broad kills blocked
ok("kill -9 -1 blocked", blocks("kill -9 -1"));
ok("kill -9 0 blocked", blocks("kill -9 0"));
ok("killall node blocked", blocks("killall node"));
ok("pkill chrome blocked", blocks("pkill chrome"));
ok("taskkill /f /im node.exe blocked", blocks("taskkill /f /im node.exe"));
ok("taskkill /f /fi blocked", blocks('taskkill /f /fi "STATUS eq NOT RESPONDING"'));
ok("Stop-Process blocked", blocks("powershell Stop-Process -Name chrome"));
ok("kill -KILL pattern blocked", blocks("kill -KILL $(cat pidfile)"));

// Specific PID kills allowed
ok("kill specific PID allowed", passes("kill 12345"));
ok("kill -9 specific PID allowed", passes("kill -9 42069"));
ok("kill -TERM specific PID allowed", passes("kill -TERM 12345"));
ok("kill -15 specific PID allowed", passes("kill -15 12345"));
ok("taskkill /pid allowed", passes("taskkill /pid 12345"));

// Process listing allowed
ok("ps allowed", passes("ps aux"));
ok("pgrep allowed", passes("pgrep -la node"));
ok("tasklist allowed", passes("tasklist /fi \"IMAGENAME eq node.exe\""));
ok("Get-Process allowed", passes("powershell Get-Process"));

// Normal commands allowed
ok("echo allowed", passes("echo hello"));
ok("ls allowed", passes("ls -la"));
ok("empty command allowed", passes(""));
ok("git allowed", passes("git status"));

// Quoted strings should not trigger
ok("commit msg with kill allowed", passes('git commit -m "kill old process handling"'));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "killall node"}});
ok("block has WHY", r && /WHY/.test(r.reason));
ok("block has NEXT STEPS", r && /NEXT STEPS/.test(r.reason));
ok("block has FALSE POSITIVE", r && /FALSE POSITIVE/.test(r.reason));
ok("block mentions list first", r && /[Ll]ist/.test(r.reason));

// --- T831: Self-kill detection ---
console.log("\n--- T831: Self-kill detection ---");

// Dangerous scripts blocked unconditionally
ok("close-dead-tabs blocked", blocks("bash close-dead-tabs.ps1"));
ok("close-dead-tabs blocked (full path)", blocks("powershell C:/scripts/close-dead-tabs.ps1"));
var cdt = gate({tool_name: "Bash", tool_input: {command: "close-dead-tabs.ps1"}});
ok("close-dead-tabs block mentions indiscriminate", cdt && /indiscriminate/.test(cdt.reason));

// Self-kill: own PID (process.pid should be detectable)
var ownPid = process.pid;
ok("kill own PID blocked", blocks("kill " + ownPid));
ok("kill -9 own PID blocked", blocks("kill -9 " + ownPid));
ok("taskkill /pid own PID blocked", blocks("taskkill /pid " + ownPid));

// Self-kill: block message quality
var selfKill = gate({tool_name: "Bash", tool_input: {command: "kill " + ownPid}});
ok("self-kill block mentions process tree", selfKill && /process tree/.test(selfKill.reason));
ok("self-kill block has PID in message", selfKill && selfKill.reason.indexOf(String(ownPid)) >= 0);

// Safe: different PID (99999 unlikely to be in own tree)
ok("kill different PID allowed", passes("kill 99999"));
ok("taskkill /pid different PID allowed", passes("taskkill /pid 99999"));

// Parent PID detection
if (process.ppid) {
  ok("kill parent PID blocked", blocks("kill " + process.ppid));
}

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
