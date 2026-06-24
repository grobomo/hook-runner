#!/usr/bin/env node
"use strict";
var path = require("path");
var os = require("os");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/audit-log-protect-gate.js"));

var HOME = os.homedir();
var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function blocks(tool, input) {
  var r = gate({tool_name: tool, tool_input: input});
  return r && r.decision === "block";
}
function passes(tool, input) {
  return gate({tool_name: tool, tool_input: input}) === null;
}

// === Bash: deletion of log files blocked ===
ok("rm hook-log.jsonl blocked", blocks("Bash", {command: "rm ~/.claude/hooks/hook-log.jsonl"}));
ok("rm correction-log blocked", blocks("Bash", {command: "rm correction-log.jsonl"}));
ok("del audit.log blocked", blocks("Bash", {command: "del audit.log"}));
ok("unlink mandate-log blocked", blocks("Bash", {command: "unlink mandate-log.jsonl"}));
ok("truncate watchdog-log blocked", blocks("Bash", {command: "truncate -s 0 watchdog-log.jsonl"}));

// === Bash: overwrite redirect blocked ===
ok("> hook-log.jsonl blocked", blocks("Bash", {command: "echo '' > hook-log.jsonl"}));

// === Bash: append redirect allowed ===
ok(">> hook-log.jsonl allowed", passes("Bash", {command: 'echo "entry" >> hook-log.jsonl'}));

// === Bash: normal commands allowed ===
ok("cat log allowed", passes("Bash", {command: "cat hook-log.jsonl"}));
ok("grep log allowed", passes("Bash", {command: "grep error hook-log.jsonl"}));
ok("tail log allowed", passes("Bash", {command: "tail -20 hook-log.jsonl"}));
ok("rm non-log allowed", passes("Bash", {command: "rm temp-file.txt"}));
ok("echo allowed", passes("Bash", {command: "echo hello"}));
ok("empty command allowed", passes("Bash", {command: ""}));

// === Write tool: JSONL overwrite blocked ===
ok("Write hook-log.jsonl blocked", blocks("Write", {file_path: path.join(HOME, ".claude/hooks/hook-log.jsonl")}));
ok("Write dispatch.jsonl blocked", blocks("Write", {file_path: path.join(HOME, ".claude/hooks/dispatches.jsonl")}));
ok("Write audit.log blocked", blocks("Write", {file_path: "/path/to/audit.log"}));

// === Write tool: non-log files allowed ===
ok("Write .js allowed", passes("Write", {file_path: "/path/to/module.js"}));
ok("Write .md allowed", passes("Write", {file_path: "/path/to/README.md"}));
ok("Write .yaml allowed", passes("Write", {file_path: "/path/to/config.yaml"}));

// === Edit tool: allowed (edits don't truncate) ===
ok("Edit log allowed", passes("Edit", {file_path: "hook-log.jsonl"}));

// === Other tools ignored ===
ok("Read ignored", passes("Read", {file_path: "hook-log.jsonl"}));
ok("Glob ignored", passes("Glob", {}));

// === Block message quality ===
var r = gate({tool_name: "Bash", tool_input: {command: "rm hook-log.jsonl"}});
ok("block has WHY", r && /WHY/.test(r.reason));
ok("block has NEXT STEPS", r && /NEXT STEPS/.test(r.reason));
ok("block has FALSE POSITIVE", r && /FALSE POSITIVE/.test(r.reason));
ok("block mentions prune", r && /prune/.test(r.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
