// TOOLS: Edit, Write
// WORKFLOW: haiku-rules
// WHY: Dashboard files are deployed to S3 at tokentracker.click. Without a
//      reminder, Claude edits the file and marks the task done without deploying.
//      This emits a non-blocking reminder at edit time, not just at stop time.
//
// INCIDENT HISTORY:
//   2026-05-18: Multiple sessions edited dashboard without deploying changes.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function _log(obj) {
  obj.ts = new Date().toISOString();
  obj.module = "dashboard-deploy-reminder-gate";
  obj.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n"); } catch (e) {}
}

var DASHBOARD_PATH_RE = /dashboard\/[^\s"']*\.(html|js|css)$/i;

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var filePath = ((input.tool_input || {}).file_path || "");
  if (!DASHBOARD_PATH_RE.test(filePath)) return null;

  _log({ result: "remind", file: path.basename(filePath) });

  process.stderr.write(
    "[dashboard-deploy-reminder] REMINDER: " + path.basename(filePath) +
    " is deployed to S3 at s3://tokentracker-data/dashboard/. " +
    "After editing, you must: (1) aws s3 cp to deploy, " +
    "(2) invalidate CloudFront, (3) screenshot tokentracker.click to verify.\n"
  );

  return null;
};
