// TOOLS: Bash
// WORKFLOW: haiku-rules
// WHY: Local dashboard data (127.0.0.1:4100/api/*) is dev-only. Claiming success
//      based on local data is meaningless when prod (tokentracker.click) might be
//      broken. Forces verification against the deployed AWS stack.
//
// INCIDENT HISTORY:
//   2026-05-22: Session verified dashboard locally but prod S3/CloudFront was stale.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function _log(obj) {
  obj.ts = new Date().toISOString();
  obj.module = "no-local-dashboard-gate";
  obj.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n"); } catch (e) {}
}

var DASHBOARD_API_RE = /(?:127\.0\.0\.1|localhost|0\.0\.0\.0):4100\/api\//;
var ALLOWED_RE = /:4100\/(health|diagnose|judge|ask|v1\/chat)/;

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";
  if (!DASHBOARD_API_RE.test(cmd)) return null;
  if (ALLOWED_RE.test(cmd)) return null;

  _log({ result: "block", command: cmd.slice(0, 200) });

  return {
    decision: "block",
    reason: "BLOCKED: Request to local dashboard API (127.0.0.1:4100/api/*)\nWHY: Local dashboard endpoints are development-only and should not be called in production code paths, as they will not be available in deployed environments.\nNEXT STEPS:\n1. Remove or mock the local dashboard API call\n2. Use the production API endpoint instead, or configure a test double for your environment\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-local-dashboard-gate — {describe the issue}\""
  };
};
