// TOOLS: Bash
// WORKFLOW: starter
// WHY: Supervisor called `new_session.py --close-old-tab --project-dir hook-runner`
// from request-tracker tab. find_shell_pid() found request-tracker's shell and
// killed IT instead of hook-runner's tab. --close-old-tab is only safe for self-reset.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ CLOSE-OLD-TAB GATE — Blocks --close-old-tab with cross-project target │
// │                                                                        │
// │ Fires when: Bash command contains new_session.py with --close-old-tab  │
// │             AND --project-dir pointing to a different project than CWD │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-06-02: supervisor called new_session.py --close-old-tab         │
// │   --project-dir hook-runner from request-tracker tab.                  │
// │   find_shell_pid() found request-tracker's shell PID and killed it     │
// │   instead of the hook-runner tab. Lost the calling session entirely.   │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";
var path = require("path");
var fs = require("fs");

var LOG_PATH = path.join(process.env.HOME || "", ".claude", "hooks", "hook-log.jsonl");

function log(action, details) {
  try {
    var entry = JSON.stringify({
      ts: new Date().toISOString(),
      module: "close-old-tab-gate",
      action: action,
      details: details
    }) + "\n";
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) { /* best effort */ }
}

module.exports = function closeOldTabGate(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input && input.tool_input.command) || "";

  // Only care about new_session.py with --close-old-tab
  if (!/new_session\.py/.test(cmd)) return null;
  if (!/--close-old-tab/.test(cmd)) return null;

  // Extract --project-dir value
  var match = cmd.match(/--project-dir\s+["']?([^\s"']+)["']?/);
  if (!match) {
    // No --project-dir flag = self-reset, OK
    log("pass", "self-reset (no --project-dir)");
    return null;
  }

  var targetDir = match[1].replace(/\\/g, "/").replace(/\/+$/, "");
  var cwd = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, "/").replace(/\/+$/, "");

  var targetName = path.basename(targetDir);
  var cwdName = path.basename(cwd);

  // If target matches CWD (self-reset), allow
  if (targetDir === cwd) {
    log("pass", "self-reset (target matches CWD)");
    return null;
  }
  // Short form like just "hook-runner" vs full path
  if (cwd.endsWith("/" + targetName) && targetDir === targetName) {
    log("pass", "self-reset (short name matches CWD basename)");
    return null;
  }

  log("block", { cwd: cwdName, target: targetName, cmd: cmd.substring(0, 200) });

  return {
    decision: "block",
    reason: "BLOCKED: --close-old-tab with cross-project --project-dir\n" +
      "WHY: find_shell_pid() returns the CALLING tab's shell, not the target's.\n" +
      "Using --close-old-tab here will kill YOUR tab (" + cwdName + "), not the target's (" + targetName + ").\n" +
      "NEXT STEPS:\n" +
      "1. Remove --close-old-tab from the command\n" +
      "2. Just use: new_session.py --project-dir \"" + targetDir + "\"\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix close-old-tab-gate — {describe the legitimate use case}\""
  };
};
