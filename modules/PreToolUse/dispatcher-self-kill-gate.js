// TOOLS: Bash
// WORKFLOW: haiku-rules
// WHY: Request-tracker dispatcher killed its own process 4 times on 2026-06-02/03
// via close-dead-tabs.ps1, manage.py cleanup --kill, manage.py supervise, and
// context-reset --close-old-tab. Extends T831 (process-kill-gate) with
// dispatcher-specific patterns.
// T844: Mechanical gate — block self-kill from dispatcher sessions.
//
// INCIDENT HISTORY:
//   2026-06-02: manage.py cleanup --kill terminated own process tree
//   2026-06-03: new_session.py --close-old-tab from within dispatcher killed itself
//   2026-06-03: manage.py supervise stale-spawn detection killed own session
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "dispatcher-self-kill-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

function isDispatcherProject() {
  var cwd = process.cwd().replace(/\\/g, "/").toLowerCase();
  return cwd.indexOf("request-tracker") >= 0;
}

// Dispatcher-specific self-kill patterns
var SELF_KILL_PATTERNS = [
  { regex: /manage\.py\s+cleanup\b.*--kill/i, desc: "manage.py cleanup --kill" },
  { regex: /new_session\.py\b.*--close-old-tab/i, desc: "new_session.py --close-old-tab (self-reset)" },
  { regex: /context.reset.*--close-old-tab/i, desc: "context-reset --close-old-tab (self-reset)" },
  { regex: /close-dead-tabs/i, desc: "close-dead-tabs script" },
  { regex: /manage\.py\s+supervise\b.*--kill/i, desc: "manage.py supervise --kill" },
];

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  if (input.tool_name !== "Bash") return null;
  if (!isDispatcherProject()) return null;

  var cmd = (input.tool_input || {}).command || "";
  if (!cmd) return null;

  for (var i = 0; i < SELF_KILL_PATTERNS.length; i++) {
    if (SELF_KILL_PATTERNS[i].regex.test(cmd)) {
      _log({ result: "block", reason: SELF_KILL_PATTERNS[i].desc, cmd: cmd.slice(0, 100) });
      return {
        decision: "block",
        reason: "BLOCKED: " + SELF_KILL_PATTERNS[i].desc + " from dispatcher session\n" +
          "WHY: Request-tracker has killed its own process 4+ times via various self-termination mechanisms. Dispatchers cannot terminate their own process tree.\n" +
          "NEXT STEPS:\n" +
          "1. Use an external trigger (user, OS scheduler, or another session) to reset this session\n" +
          "2. For cleanup: use manage.py cleanup WITHOUT --kill (list-only mode)\n" +
          "3. For context reset: ask the user to trigger it externally\n" +
          "FALSE POSITIVE? File a TODO in hook-runner: \"Fix dispatcher-self-kill-gate — {describe the issue}\""
      };
    }
  }

  _log({ result: "pass", reason: "no_match", cmd: cmd.slice(0, 100) });
  return null;
};
