#!/usr/bin/env node
"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/instruction-to-hook-gate.js"));

// The flag file uses process.ppid for session isolation
var FLAG_FILE = path.join(os.tmpdir(), ".claude-instruction-pending-" + process.ppid);

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

// Clean state
try { fs.unlinkSync(FLAG_FILE); } catch(e) {}

// === Without flag: everything passes ===
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Bash tool ignored", gate({tool_name: "Bash", tool_input: {}}) === null);
ok("no flag: edit code passes", gate({tool_name: "Edit", tool_input: {file_path: "/src/app.js", new_string: "x"}}) === null);
ok("no flag: write file passes", gate({tool_name: "Write", tool_input: {file_path: "/config.yml", content: "x"}}) === null);

// === With flag: non-hook edits blocked ===
fs.writeFileSync(FLAG_FILE, JSON.stringify({
  pattern: "always X",
  preview: "always run tests before committing"
}));

var r1 = gate({tool_name: "Edit", tool_input: {file_path: "/src/app.js", new_string: "x"}});
ok("flag: edit code blocked", r1 && r1.decision === "block");
ok("block mentions instruction", r1 && /instruction/i.test(r1.reason));
ok("block mentions detected pattern", r1 && /always X/.test(r1.reason));

// Re-create flag (might be cleared by allowed edits)
fs.writeFileSync(FLAG_FILE, JSON.stringify({pattern: "always X", preview: "always run tests"}));

var r2 = gate({tool_name: "Write", tool_input: {file_path: "/README.md", content: "x"}});
ok("flag: write non-hook blocked", r2 && r2.decision === "block");

// === Hook/rule file edits allowed (and clear flag) ===
fs.writeFileSync(FLAG_FILE, JSON.stringify({pattern: "always X", preview: "always run tests"}));

ok("flag: edit run-modules allowed", gate({tool_name: "Edit", tool_input: {file_path: "/run-modules/PreToolUse/my-gate.js", new_string: "x"}}) === null);
// Flag should be cleared after hook edit
ok("flag cleared after hook edit", !fs.existsSync(FLAG_FILE));

// Re-create and test other allowed paths
fs.writeFileSync(FLAG_FILE, JSON.stringify({pattern: "x", preview: "y"}));
ok("flag: edit settings.json allowed", gate({tool_name: "Edit", tool_input: {file_path: "/.claude/settings.json", new_string: "x"}}) === null);

fs.writeFileSync(FLAG_FILE, JSON.stringify({pattern: "x", preview: "y"}));
ok("flag: edit CLAUDE.md allowed", gate({tool_name: "Edit", tool_input: {file_path: "/project/CLAUDE.md", new_string: "x"}}) === null);

fs.writeFileSync(FLAG_FILE, JSON.stringify({pattern: "x", preview: "y"}));
ok("flag: edit specs allowed", gate({tool_name: "Edit", tool_input: {file_path: "/specs/T001/tasks.md", new_string: "x"}}) === null);

fs.writeFileSync(FLAG_FILE, JSON.stringify({pattern: "x", preview: "y"}));
ok("flag: edit test script allowed", gate({tool_name: "Edit", tool_input: {file_path: "/scripts/test/test-gate.js", new_string: "x"}}) === null);

// Clean up
try { fs.unlinkSync(FLAG_FILE); } catch(e) {}

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
