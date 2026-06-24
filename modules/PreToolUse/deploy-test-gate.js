// TOOLS: Bash
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Modules were deployed to live (cp to run-modules/) without tests. The
// health-report-check (T831) was deployed untested — user caught it. This gate
// blocks deploy-to-live when the source module has no corresponding test file.
// T832: Mechanical deploy-test enforcement.
//
// INCIDENT HISTORY:
// 2026-06-02: T831 — health-report-check.js deployed to run-modules/ without any
//   test file. User called it out: "untested, undocumented, unauditable."
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var HOOK_LOG = path.join(HOOKS_DIR, "hook-log.jsonl");

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "deploy-test-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(HOOK_LOG, JSON.stringify(entry) + "\n"); } catch (e) {}
}

module.exports = function(input) {
  if ((input || {}).tool_name !== "Bash") return null;

  var cmd = ((input.tool_input || {}).command || "");
  if (!cmd) return null;

  // Only check cp/copy commands targeting run-modules/
  if (!/\b(cp|copy)\b/.test(cmd)) return null;
  if (!/run-modules\//.test(cmd) && !/run-modules\\/.test(cmd)) return null;

  // Extract source file from cp command
  // Pattern: cp "source" "dest" or cp source dest
  var parts = cmd.match(/\bcp\s+(?:-[a-z]+\s+)?["']?([^"'\s]+\.js)["']?\s+["']?([^"'\s]+run-modules[^"'\s]*)["']?/i);
  if (!parts) return null;

  var sourceFile = parts[1];
  var moduleName = path.basename(sourceFile, ".js");

  // Skip helpers (underscore prefix)
  if (moduleName.charAt(0) === "_") return null;

  // Check if source is from hook-runner repo
  var projDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (projDir.indexOf("hook-runner") === -1) return null;

  // Look for a test file matching this module
  var testDir = path.join(projDir, "scripts", "test");
  var hasTest = false;

  try {
    if (fs.existsSync(testDir)) {
      var testFiles = fs.readdirSync(testDir);
      for (var i = 0; i < testFiles.length; i++) {
        // Match: test-modulename.js, test-modulename.sh, test-TXXX-modulename.js
        var tf = testFiles[i].toLowerCase();
        var mn = moduleName.toLowerCase().replace(/-/g, "");
        var tfClean = tf.replace(/^test-/, "").replace(/^t\d+-/, "").replace(/\.(js|sh)$/, "").replace(/-/g, "");
        if (tfClean === mn || tf.indexOf(mn) !== -1) {
          hasTest = true;
          break;
        }
      }
    }
  } catch (e) {}

  if (hasTest) {
    log({ action: "pass", module: moduleName });
    return null;
  }

  log({ action: "blocked", module: moduleName, reason: "no test file" });
  return {
    decision: "block",
    reason: "BLOCKED: Deploying " + moduleName + ".js to live without tests.\n" +
      "WHY: T831 was deployed untested — user caught it. Every module needs tests before going live.\n" +
      "NEXT STEPS:\n" +
      "1. Create scripts/test/test-" + moduleName + ".js (or .sh)\n" +
      "2. Run it and verify all tests pass\n" +
      "3. Then retry the deploy\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix deploy-test-gate — {describe the issue}\""
  };
};
