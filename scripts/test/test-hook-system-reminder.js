#!/usr/bin/env node
"use strict";
// Test suite for hook-system-reminder module (T397)

var path = require("path");
var os = require("os");
var MOD = path.join(__dirname, "../../modules/PreToolUse/hook-system-reminder.js");

var pass = 0, fail = 0;
function assert(name, ok) {
  if (ok) { console.log("  PASS: " + name); pass++; }
  else { console.log("  FAIL: " + name); fail++; }
}

var gate = require(MOD);
var home = os.homedir().replace(/\\/g, "/");

console.log("=== hook-runner: hook-system-reminder (T397) ===");

// 1. Non-hook file passes
var r1 = gate({ tool_name: "Write", tool_input: { file_path: "/tmp/foo.js" } });
assert("non-claude file passes", r1 === null);

// 2. Write to ~/.claude/rules/ blocked
var r2 = gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/rules/never-do-x.md" } });
assert("write to .claude/rules/ blocked", r2 && r2.decision === "block");

// 3. Edit hook-runner source (in hooks dir) passes
var r3 = gate({ tool_name: "Edit", tool_input: { file_path: home + "/.claude/hooks/run-modules/PreToolUse/hook-runner/some-gate.js" } });
assert("hook-runner source edit passes", r3 === null);

// 4. Write to settings.json passes
var r4 = gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/settings.json" } });
assert("settings.json passes", r4 === null);

// 5. Write to settings.local.json passes
var r5 = gate({ tool_name: "Write", tool_input: { file_path: home + "/.claude/settings.local.json" } });
assert("settings.local.json passes", r5 === null);

// 6. Edit CLAUDE.md in ~/.claude/ blocked
var r6 = gate({ tool_name: "Edit", tool_input: { file_path: home + "/.claude/CLAUDE.md" } });
assert("edit CLAUDE.md blocked", r6 && r6.decision === "block");

// 7. Read tool passes (not Write/Edit)
var r7 = gate({ tool_name: "Read", tool_input: { file_path: home + "/.claude/rules/foo.md" } });
assert("Read tool passes", r7 === null);

// 8. Bash tool passes
var r8 = gate({ tool_name: "Bash", tool_input: { command: "cat " + home + "/.claude/rules/foo.md" } });
assert("Bash tool passes", r8 === null);

// 9. Windows backslash paths normalized
var winPath = home.replace(/\//g, "\\") + "\\.claude\\rules\\test.md";
var r9 = gate({ tool_name: "Write", tool_input: { file_path: winPath } });
assert("Windows backslash paths blocked", r9 && r9.decision === "block");

// 10. Block message contains reminder text
assert("block message mentions hook-runner", r2.reason.indexOf("hook-runner") !== -1);
assert("block message mentions NEVER CREATE", r2.reason.indexOf("NEVER CREATE") !== -1);

console.log("\n" + pass + "/" + (pass + fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
