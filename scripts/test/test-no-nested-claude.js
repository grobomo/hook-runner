#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/no-nested-claude.js"));

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
ok("Edit tool ignored", gate({tool_name: "Edit", tool_input: {}}) === null);

// Nested claude commands blocked
ok("claude -p blocked", blocks("claude -p 'do something'"));
ok("claude --print blocked", blocks("claude --print 'task'"));
ok("claude -m blocked", blocks("claude -m 'message'"));
ok("claude --message blocked", blocks("claude --message 'test'"));
ok("pipe to claude blocked", blocks("echo task | claude"));
ok("claude -c blocked", blocks("claude -c continue"));

// Search patterns with "claude" allowed (false positive fix)
ok("grep claude allowed", passes('grep -E "vpn|monitor|claude" file.txt'));
ok("rg claude allowed", passes('rg "claude" ~/.claude/'));
ok("findstr claude allowed", passes('findstr "claude" settings.json'));

// Git commands with claude in path/message allowed
ok("git commit with claude path allowed", passes('git commit -m "update ~/.claude/hooks"'));
ok("git push allowed", passes("git push origin main"));
ok("gh_auto allowed", passes("gh_auto push origin main"));

// Normal commands allowed
ok("echo allowed", passes("echo hello"));
ok("node allowed", passes("node setup.js"));
ok("empty command allowed", passes(""));

// Block message quality
var r = gate({tool_name: "Bash", tool_input: {command: "claude -p 'test'"}});
ok("block mentions context_reset", r && /context_reset/i.test(r.reason));
ok("block mentions subprocess", r && /subprocess/.test(r.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
