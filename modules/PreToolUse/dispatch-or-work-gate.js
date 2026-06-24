// TOOLS: Bash, Edit, Write
// WORKFLOW: haiku-rules
// requires: _haiku-judge
// WHY: Mechanical gates (T840, T841) catch obvious violations (SSH, cross-project
// edits) but miss ambiguous cases: writing implementation code inside request-tracker,
// running complex build/test commands, or making config changes that belong in worker
// sessions. Haiku provides judgment on intent.
// T842: Haiku PreToolUse gate — "Is this dispatch/management or direct work?"
//
// INCIDENT HISTORY:
//   2026-06-04: Dispatcher wrote Python implementation code, ran npm install,
//   and built dashboards — all within request-tracker directory but all
//   implementation work that should have been dispatched.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");
var judge = require("./_haiku-judge");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "dispatch-or-work-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

function isDispatcherProject() {
  var cwd = process.cwd().replace(/\\/g, "/").toLowerCase();
  return cwd.indexOf("request-tracker") >= 0;
}

// Skip read-only tools — only judge state-changing actions
var STATE_CHANGING_TOOLS = ["Bash", "Edit", "Write"];

// Skip clearly safe commands (don't waste Haiku calls)
var SAFE_COMMANDS = [
  /^python\s+manage\.py\s+(poll|status|heartbeat|email-poll|supervise|dispatch|debrief|list|report)/i,
  /^curl\s+.*(?:127\.0\.0\.1|localhost)/,
  /^cat\s/,
  /^ls\s/,
  /^echo\s/,
  /^git\s/,
  /^gh\s/,
  /^node\s.*setup\.js/,
];

module.exports = async function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  if (STATE_CHANGING_TOOLS.indexOf(input.tool_name) < 0) return null;
  if (!isDispatcherProject()) return null;

  var cmd = "";
  var filePath = "";
  if (input.tool_name === "Bash") {
    cmd = (input.tool_input || {}).command || "";
    if (!cmd) return null;
    // Skip safe commands
    for (var s = 0; s < SAFE_COMMANDS.length; s++) {
      if (SAFE_COMMANDS[s].test(cmd.trim())) {
        _log({ result: "pass", reason: "safe_command", cmd: cmd.slice(0, 80) });
        return null;
      }
    }
  } else {
    filePath = (input.tool_input || {}).file_path || "";
    // Own-project edits to management files are fine
    if (filePath.replace(/\\/g, "/").toLowerCase().indexOf("request-tracker") >= 0) {
      var basename = path.basename(filePath).toLowerCase();
      if (/^(todo|readme|session_state|changelog)\.md$/i.test(basename) ||
          /manage\.py$/i.test(basename) ||
          /\.coconut\//i.test(filePath)) {
        _log({ result: "pass", reason: "management_file", file: filePath.slice(-60) });
        return null;
      }
    }
  }

  var context = input.tool_name === "Bash"
    ? "Bash command: " + cmd.slice(0, 200)
    : input.tool_name + " file: " + filePath.slice(-100);

  var result = await judge({
    question: "The request-tracker session is a dispatcher/manager. It should: create requests, " +
      "dispatch to workers via TODO.md, poll/follow-up, debrief sessions, report results, " +
      "update its own management scripts. It should NOT: write implementation code, run " +
      "upgrades, edit configs for other services, test implementations, or build features. " +
      "Is this action dispatching/managing or doing implementation work? Action: " + context,
    context: "Tool: " + input.tool_name,
    gate: "dispatch-or-work-gate",
    fallback: "allow"
  });

  if (result.fallback_used) {
    _log({ result: "pass", reason: "haiku_unavailable", cmd: (cmd || filePath).slice(0, 80) });
    return null;
  }

  if (result.allow) {
    _log({ result: "pass", reason: result.reason, confidence: result.confidence, cmd: (cmd || filePath).slice(0, 80) });
    return null;
  }

  _log({ result: "block", reason: result.reason, confidence: result.confidence, cmd: (cmd || filePath).slice(0, 80) });
  return {
    decision: "block",
    reason: "BLOCKED: Implementation work detected in dispatcher session\n" +
      "WHY: " + (result.reason || "Request-tracker should dispatch work, not implement it") + "\n" +
      "NEXT STEPS:\n" +
      "1. Write a TODO in the target project's TODO.md describing what needs to be done\n" +
      "2. Spawn a worker session for that project\n" +
      "3. Let the worker session handle implementation\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix dispatch-or-work-gate — {describe the issue}\""
  };
};
