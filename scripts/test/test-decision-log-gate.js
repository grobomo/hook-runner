#!/usr/bin/env node
// Test: decision-log-gate warns when hook infra edited without decision entry
"use strict";

var path = require("path");
var fs = require("fs");
var os = require("os");
var REPO_DIR = path.resolve(__dirname, "../..");
var MODULE = path.join(REPO_DIR, "modules/PostToolUse/decision-log-gate.js");

process.env.HOOK_RUNNER_TEST = "1";
process.env.CLAUDE_SESSION_ID = "test1234-abcd-5678";

// Use temp decisions file
var tmpDir = os.tmpdir();
var tmpDecisions = path.join(tmpDir, "test-decisions-" + process.pid + ".jsonl");
// Monkey-patch the module's DECISIONS_PATH
var HOME = process.env.HOME || process.env.USERPROFILE || "";

var gate = require(MODULE);
var pass = 0, fail = 0;

function ok(label, val) {
  if (val) { console.log("  PASS: " + label); pass++; }
  else { console.log("  FAIL: " + label); fail++; }
}

// Capture stderr
var stderrOutput = "";
var origWrite = process.stderr.write;
function captureStderr() { stderrOutput = ""; process.stderr.write = function(s) { stderrOutput += s; }; }
function restoreStderr() { process.stderr.write = origWrite; }

function edit(filePath, content) {
  return gate({ tool_name: "Edit", tool_input: { file_path: filePath, new_string: content || "var x = 1;" } });
}
function write(filePath, content) {
  return gate({ tool_name: "Write", tool_input: { file_path: filePath, content: content || "// content" } });
}

console.log("=== decision-log-gate (T777) ===");

// 1. Non-hook files pass silently
captureStderr();
var r = edit("/tmp/app.js", "var x = 1;");
ok("non-hook file passes (null)", r === null);
ok("non-hook file no warning", stderrOutput === "");
restoreStderr();

// 2. Hook module edit without decision entry warns
captureStderr();
r = edit(HOME + "/.claude/hooks/run-modules/PreToolUse/my-gate.js", "updated code");
ok("hook module edit returns null (non-blocking)", r === null);
ok("hook module edit warns about missing decision", stderrOutput.indexOf("DECISION LOG WARNING") !== -1);
ok("warning mentions the file", stderrOutput.indexOf("my-gate.js") !== -1);
ok("warning mentions session", stderrOutput.indexOf("test1234") !== -1);
restoreStderr();

// 3. Runner edit warns
captureStderr();
edit(HOME + "/.claude/hooks/run-stop.js", "exit(1)");
ok("runner edit warns", stderrOutput.indexOf("DECISION LOG WARNING") !== -1);
ok("runner type detected", stderrOutput.indexOf("runner") !== -1);
restoreStderr();

// 4. Stop rules edit warns
captureStderr();
edit(HOME + "/.claude/proxy/stop-haiku-rules.yaml", "new rule");
ok("stop rules edit warns", stderrOutput.indexOf("DECISION LOG WARNING") !== -1);
ok("stop-rules type detected", stderrOutput.indexOf("stop-rules") !== -1);
restoreStderr();

// 5. Bash tool passes through
r = gate({ tool_name: "Bash", tool_input: { command: "echo hi" } });
ok("Bash passes", r === null);

// 6. Read tool passes through
r = gate({ tool_name: "Read", tool_input: { file_path: HOME + "/.claude/hooks/run-stop.js" } });
ok("Read passes", r === null);

// 7. Regular project file passes
captureStderr();
edit(HOME + "/Documents/app/src/index.js", "code");
ok("regular file no warning", stderrOutput === "");
restoreStderr();

// 8. Write to hook module also warns
captureStderr();
write(HOME + "/.claude/hooks/run-modules/Stop/new-gate.js", "// module");
ok("Write to hook module warns", stderrOutput.indexOf("DECISION LOG WARNING") !== -1);
restoreStderr();

// Cleanup
try { fs.unlinkSync(tmpDecisions); } catch(e) {}

console.log("\n=== Results: " + pass + " passed, " + fail + " failed ===");
process.exit(fail > 0 ? 1 : 0);
