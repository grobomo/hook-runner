// TOOLS: Stop
// BLOCKING: true
// WHY: Dashboard files were modified but never deployed to S3/CloudFront.
//      Users saw stale dashboard at tokentracker.click because Claude edited
//      the HTML locally and declared "done" without uploading.
//
// INCIDENT HISTORY:
//   2026-05-18: Dashboard edits made but not pushed to S3. Public site stale.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function _log(obj) {
  obj.ts = new Date().toISOString();
  obj.module = "dashboard-deploy-verify-gate";
  obj.event = "Stop";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n"); } catch (e) {}
}

var DASHBOARD_EDIT_PATTERNS = [
  /dashboard\/[^\s"']+\.(html|js|css)/i,
  /["']file_path["']\s*:\s*["'][^"']*dashboard\//i,
];

var S3_UPLOAD_PATTERNS = [
  /aws\s+s3\s+(cp|sync)\b/i,
  /s3:\/\/tokentracker/i,
];

var CLOUDFRONT_PATTERNS = [
  /cloudfront.*invalidat/i,
  /create-invalidation/i,
  /InvalidationBatch/i,
];

var SCREENSHOT_PATTERNS = [
  /browser_take_screenshot/i,
  /tokentracker\.click/i,
  /\/tmp\/dash[^"'\s]*.png/i,
];

function readTranscript() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return "";
  var slug = path.resolve(projectDir).replace(/[^a-zA-Z0-9-]/g, "-");
  var logsDir = path.join(HOME, ".claude", "projects", slug);
  if (!fs.existsSync(logsDir)) return "";
  try {
    var files = fs.readdirSync(logsDir).filter(function(f) { return f.endsWith(".jsonl"); });
    if (files.length === 0) return "";
    var newest = files.reduce(function(a, b) {
      try { return fs.statSync(path.join(logsDir, a)).mtimeMs > fs.statSync(path.join(logsDir, b)).mtimeMs ? a : b; }
      catch (e) { return a; }
    });
    return fs.readFileSync(path.join(logsDir, newest), "utf-8");
  } catch (e) { return ""; }
}

function matchesAny(text, patterns) {
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(text)) return true;
  }
  return false;
}

module.exports = function(input) {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir || projectDir.indexOf("llm-token-tracker") === -1) {
    _log({ result: "skip", reason: "not llm-token-tracker project" });
    return null;
  }

  var transcript = readTranscript();
  if (!transcript || transcript.length < 100) {
    _log({ result: "skip", reason: "no transcript" });
    return null;
  }

  var hasDashboardEdits = matchesAny(transcript, DASHBOARD_EDIT_PATTERNS);
  if (!hasDashboardEdits) {
    _log({ result: "pass", reason: "no dashboard edits detected" });
    return null;
  }

  var hasS3Upload = matchesAny(transcript, S3_UPLOAD_PATTERNS);
  var hasCloudFront = matchesAny(transcript, CLOUDFRONT_PATTERNS);
  var hasScreenshot = matchesAny(transcript, SCREENSHOT_PATTERNS);

  if (hasS3Upload && hasCloudFront && hasScreenshot) {
    _log({ result: "pass", reason: "all deploy evidence found" });
    return null;
  }

  var missing = [];
  if (!hasS3Upload) missing.push("deploy to S3 (aws s3 cp)");
  if (!hasCloudFront) missing.push("invalidate CloudFront");
  if (!hasScreenshot) missing.push("screenshot tokentracker.click");

  _log({ result: "block", reason: "missing: " + missing.join(", ") });
  return {
    decision: "block",
    reason: "BLOCKED: Dashboard edited but not fully deployed — missing: " + missing.join(", ") + "\nWHY: Dashboard files were modified without being deployed, causing users to see stale content at tokentracker.click\nNEXT STEPS:\n" + missing.map(function(s, i) { return (i + 1) + ". " + s; }).join("\n") + "\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix dashboard-deploy-verify-gate — {describe the issue}\""
  };
};
