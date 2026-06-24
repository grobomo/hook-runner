// TOOLS: SessionStart
// WORKFLOW: haiku-rules
// WHY: Every request-tracker session had to manually set up CronCreate for the
// dispatch/supervise heartbeat cycle. This was forgotten 3+ times, leaving the
// dispatcher idle without polling. Auto-emit the cron instruction at session start.
// T843: SessionStart module — auto-instruct CronCreate for dispatch cycle.
//
// INCIDENT HISTORY:
//   2026-06-04: Dispatcher session sat idle for 40 minutes because CronCreate
//   was not set up. No polling, no dispatching, requests piled up.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "dispatcher-cron-check";
  entry.event = "SessionStart";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

function isDispatcherProject() {
  var cwd = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, "/").toLowerCase();
  return cwd.indexOf("request-tracker") >= 0;
}

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  if (!isDispatcherProject()) return null;

  _log({ result: "emit", reason: "dispatcher_session_start" });

  var msg = [
    "[dispatcher-cron-check] Request-tracker session detected.",
    "Set up the dispatch heartbeat cycle with CronCreate:",
    "",
    "  Cron: */3 * * * *  (every 3 minutes)",
    "  Prompt: Run heartbeat check: python manage.py heartbeat-check --json",
    "    If status != clean: run python manage.py poll && python manage.py email-poll",
    "    Check fleet tab count: curl -s http://127.0.0.1:4100/api/fleet | python3 -c \"import json,sys; d=json.load(sys.stdin); print(len(d.get('sessions',[])), 'sessions')\"",
    "    If tab count > 4: log warning about tab sprawl",
    "    Skip if heartbeat is clean — do NOT respond with 'Stable. Monitoring.'",
    "",
    "  Also set up: CronCreate for supervise (*/5 * * * *)",
    "  Prompt: python manage.py supervise --no-kill (list stale sessions, don't kill)",
    "",
    "IMPORTANT: Do NOT ask if you should set these up. Just create both CronCreate jobs now.",
  ].join("\n");

  process.stderr.write(msg + "\n");
  return null;
};
