// TOOLS: Bash
// WORKFLOW: haiku-rules
// WHY: Request-tracker dispatcher session ran SSH/SCP to remote hosts directly instead
// of dispatching the work to a project-specific session. Dispatcher should manage, not execute.
// T840: Mechanical gate — block ssh/scp/rsync from request-tracker sessions.
//
// INCIDENT HISTORY:
//   2026-06-04: Dispatcher session SSH'd into IMSVA hosts to run upgrades directly,
//   bypassing the imsva-upgrade project session that should handle it.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "block-remote-execution-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

// Only fires when cwd matches request-tracker
function isDispatcherProject() {
  var cwd = process.cwd().replace(/\\/g, "/").toLowerCase();
  return cwd.indexOf("request-tracker") >= 0;
}

// Remote execution patterns
var REMOTE_PATTERNS = [
  { regex: /\bssh\b[^|;]*@(?!127\.0\.0\.1\b|localhost\b)/, desc: "SSH to remote host" },
  { regex: /\bscp\b[^|;]*@/, desc: "SCP file transfer" },
  { regex: /\brsync\b[^|;]*@/, desc: "rsync to remote host" },
];

// Safe patterns — local management commands
var SAFE_PATTERNS = [
  /\bcurl\b.*(?:127\.0\.0\.1|localhost)/,      // API management calls
  /\bssh\b.*(?:127\.0\.0\.1|localhost)\b/,      // local tunnel
  /\bpython\b.*manage\.py\b/,                   // project management scripts
  /\bgh\b/,                                      // GitHub CLI
  /\bgit\b/,                                     // git operations
];

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  if (input.tool_name !== "Bash") return null;
  if (!isDispatcherProject()) return null;

  var cmd = (input.tool_input || {}).command || "";
  if (!cmd) return null;

  // Check safe patterns first
  for (var s = 0; s < SAFE_PATTERNS.length; s++) {
    if (SAFE_PATTERNS[s].test(cmd)) {
      _log({ result: "pass", reason: "safe_pattern", cmd: cmd.slice(0, 100) });
      return null;
    }
  }

  // Check remote execution patterns
  for (var i = 0; i < REMOTE_PATTERNS.length; i++) {
    if (REMOTE_PATTERNS[i].regex.test(cmd)) {
      _log({ result: "block", reason: REMOTE_PATTERNS[i].desc, cmd: cmd.slice(0, 100) });
      return {
        decision: "block",
        reason: "BLOCKED: " + REMOTE_PATTERNS[i].desc + " from dispatcher session\n" +
          "WHY: Request-tracker is a manager — it dispatches work, not executes it. Remote operations belong in project-specific sessions.\n" +
          "NEXT STEPS:\n" +
          "1. Write a TODO in the target project's TODO.md describing the remote work needed\n" +
          "2. Spawn a session in that project: python3 context-reset/new_session.py --project-dir /path/to/project\n" +
          "3. Let the worker session handle the remote execution\n" +
          "FALSE POSITIVE? File a TODO in hook-runner: \"Fix block-remote-execution-gate — {describe the issue}\""
      };
    }
  }

  _log({ result: "pass", reason: "no_match", cmd: cmd.slice(0, 100) });
  return null;
};
