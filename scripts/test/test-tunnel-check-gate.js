#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/tunnel-check-gate.js"));

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

// === Non-Bash tools ignored ===
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Edit tool ignored", gate({tool_name: "Edit", tool_input: {}}) === null);
ok("Write tool ignored", gate({tool_name: "Write", tool_input: {}}) === null);

// === Blocks: tasklist + grep ssh ===
ok("tasklist | grep ssh blocked", blocks("tasklist 2>/dev/null | grep -i ssh | head -10"));
ok("tasklist | grep -i ssh blocked", blocks("tasklist | grep -i ssh"));
ok("tasklist | findstr ssh blocked", blocks("tasklist | findstr ssh"));
ok("tasklist | findstr /i ssh blocked", blocks("tasklist | findstr /i ssh"));

// === Blocks: ps + grep ssh ===
ok("ps aux | grep ssh blocked", blocks("ps aux | grep ssh"));
ok("ps ef | grep ssh blocked", blocks("ps ef | grep ssh"));
ok("ps a | grep ssh blocked", blocks("ps a | grep ssh"));
ok("ps aux | grep -i ssh blocked", blocks("ps aux | grep -i ssh"));

// === Blocks: pgrep ssh ===
ok("pgrep ssh blocked", blocks("pgrep ssh"));
ok("pgrep -f ssh blocked", blocks("pgrep -f ssh"));

// === Blocks: wmic process ssh ===
ok("wmic process ssh blocked", blocks("wmic process list | grep ssh"));

// === Allows: process management (kill/stop/terminate) ===
ok("taskkill ssh allowed", passes("taskkill /f /im ssh.exe"));
ok("kill ssh allowed", passes("ps aux | grep ssh | kill"));
ok("pkill ssh allowed", passes("pkill ssh"));
ok("terminate in command allowed", passes("tasklist | grep ssh | terminate-process"));

// === Allows: unrelated commands ===
ok("ssh command itself allowed", passes("ssh user@host ls"));
ok("scp allowed", passes("scp file.txt user@host:/tmp/"));
ok("ssh-keygen allowed", passes("ssh-keygen -t ed25519"));
ok("grep non-ssh allowed", passes("ps aux | grep python"));
ok("tasklist non-ssh allowed", passes("tasklist | grep node"));
ok("echo ssh allowed", passes("echo 'checking ssh'"));
ok("empty command allowed", passes(""));

// === Block message quality ===
var r = gate({tool_name: "Bash", tool_input: {command: "tasklist | grep -i ssh"}});
ok("block mentions port connectivity", r && /port connectivity/i.test(r.reason));
ok("block mentions unreliable", r && /unreliable/i.test(r.reason));
ok("block mentions health-check", r && /health-check/i.test(r.reason));
ok("block includes detected command", r && /DETECTED/.test(r.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
