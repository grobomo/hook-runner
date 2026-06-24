#!/usr/bin/env node
"use strict";
var path = require("path");
var fs = require("fs");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/disk-space-guard.js"));

var STATE_FILE = gate.STATE_FILE;
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

// Clean state
try { fs.unlinkSync(STATE_FILE); } catch(e) {}

// === Without alert: everything passes ===
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("no alert: rm -rf passes", passes("rm -rf old-dir/"));
ok("no alert: rm passes", passes("rm -rf /tmp/junk"));
ok("no alert: prune passes", passes("docker system prune"));
ok("no alert: empty passes", passes(""));

// === With alert: destructive blocked ===
fs.writeFileSync(STATE_FILE, "disk-full");

ok("alert: rm -rf blocked", blocks("rm -rf old-dir/"));
ok("alert: rm -r blocked", blocks("rm -r some-dir"));
ok("alert: rmdir blocked", blocks("rmdir old"));
ok("alert: prune blocked", blocks("docker system prune"));
ok("alert: purge blocked", blocks("apt purge package"));
ok("alert: clean --force blocked", blocks("npm cache clean --force"));

// Non-destructive commands still pass during alert
ok("alert: echo passes", passes("echo hello"));
ok("alert: ls passes", passes("ls -la"));
ok("alert: git passes", passes("git status"));
ok("alert: node passes", passes("node setup.js"));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "rm -rf old/"}});
ok("block mentions disk/destructive", r && /disk|destructive|space/i.test(r.reason));
ok("block has WHY + NEXT STEPS", r && /WHY:/.test(r.reason) && /NEXT STEPS:/i.test(r.reason));

// Exports
ok("exports DISK_ERROR_PATTERNS", Array.isArray(gate.DISK_ERROR_PATTERNS));
ok("exports STATE_FILE", typeof gate.STATE_FILE === "string");

// Clean up
try { fs.unlinkSync(STATE_FILE); } catch(e) {}

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
