#!/usr/bin/env node
"use strict";
var path = require("path");
var os = require("os");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/no-rules-gate.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

var HOME = os.homedir().replace(/\\/g, "/");

function blocks(tool, filePath) {
  var r = gate({tool_name: tool, tool_input: {file_path: filePath}});
  return r && r.decision === "block";
}
function passes(tool, filePath) {
  return gate({tool_name: tool, tool_input: {file_path: filePath}}) === null;
}

// Non-edit tools ignored
ok("Read ignored", passes("Read", HOME + "/.claude/rules/test.md"));
ok("Bash ignored", passes("Bash", HOME + "/.claude/rules/test.md"));

// Global rules blocked
ok("Write to global rules blocked", blocks("Write", HOME + "/.claude/rules/test.md"));
ok("Edit global rules blocked", blocks("Edit", HOME + "/.claude/rules/enforce.md"));

// Project rules blocked
ok("Write .claude/rules blocked", blocks("Write", "/project/.claude/rules/gate.md"));
ok("Edit .claude/rules blocked", blocks("Edit", "/project/.claude/rules/enforce.md"));
ok("Windows path .claude\\rules blocked", blocks("Write", "C:\\project\\.claude\\rules\\gate.md"));

// Non-rules .claude paths allowed
ok(".claude/settings.json passes", passes("Write", HOME + "/.claude/settings.json"));
ok(".claude/hooks passes", passes("Edit", HOME + "/.claude/hooks/run-pretooluse.js"));

// Other paths with 'rules' in name allowed
ok("src/rules.js passes", passes("Write", "/project/src/rules.js"));
ok("docs/rules/ passes", passes("Edit", "/project/docs/rules/readme.md"));

// Empty path passes
ok("empty path passes", passes("Write", ""));

// Block message quality
var r = gate({tool_name: "Write", tool_input: {file_path: HOME + "/.claude/rules/test.md"}});
ok("block mentions hook-runner", r && /hook-runner/i.test(r.reason));
ok("block mentions module", r && /module/i.test(r.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
