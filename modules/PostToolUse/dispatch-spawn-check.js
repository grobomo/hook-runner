// TOOLS: Bash
// WORKFLOW: haiku-rules
// WHY: Dispatcher session ran manage.py poll and saw pending dispatches to projects
// that had no active Claude session. The dispatches sat unactioned for hours because
// nobody told the dispatcher to spawn a session. This check auto-advises.
// T815: PostToolUse — detect pending dispatches to sessionless projects.
//
// INCIDENT HISTORY:
//   2026-06-04: 3 dispatches to imsva-upgrade sat pending for 2+ hours because
//   the request-tracker session didn't notice no worker session was running.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "dispatch-spawn-check";
  entry.event = "PostToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

function isDispatcherProject() {
  var cwd = process.cwd().replace(/\\/g, "/").toLowerCase();
  return cwd.indexOf("request-tracker") >= 0;
}

// Patterns that indicate pending/dispatched work in poll output
var PENDING_PATTERNS = [
  /dispatch(?:ed|ing)\s+(?:to|for)\s+(\S+)/gi,
  /pending\s+(?:in|for)\s+(\S+)/gi,
  /(?:wrote|written)\s+TODO\s+(?:to|in)\s+(\S+)/gi,
  /spawning?\s+session\s+(?:for|in)\s+(\S+)/gi,
  /["']dispatched?_to["']\s*:\s*["']([^"']+)["']/gi,
];

// Pattern for fleet output showing no session for a project
var NO_SESSION_PATTERN = /no\s+(?:active\s+)?session|0\s+sessions/i;

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  if (input.tool_name !== "Bash") return null;
  if (!isDispatcherProject()) return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  // Only fire after poll/dispatch/status commands
  if (!/manage\.py\s+(poll|dispatch|status|heartbeat)/i.test(cmd)) return null;

  var output = (input.tool_result || "").toString();
  if (!output) return null;

  // Look for dispatch/pending mentions
  var projects = [];
  for (var i = 0; i < PENDING_PATTERNS.length; i++) {
    var m;
    PENDING_PATTERNS[i].lastIndex = 0;
    while ((m = PENDING_PATTERNS[i].exec(output)) !== null) {
      var proj = m[1].replace(/['"\/\\:]/g, "").toLowerCase();
      if (proj && projects.indexOf(proj) < 0) {
        projects.push(proj);
      }
    }
  }

  if (projects.length === 0) {
    _log({ result: "pass", reason: "no_pending_dispatches", cmd: cmd.slice(0, 80) });
    return null;
  }

  _log({ result: "advisory", reason: "pending_dispatches", projects: projects });

  var msg = "[dispatch-spawn-check] Pending dispatches detected for: " + projects.join(", ") + "\n" +
    "Check if active sessions exist for these projects (curl http://127.0.0.1:4100/api/fleet).\n" +
    "If no session is running, spawn one: python3 context-reset/new_session.py --project-dir <path>";

  process.stderr.write(msg + "\n");
  return null; // PostToolUse never blocks
};
