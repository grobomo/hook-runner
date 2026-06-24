// TOOLS: Stop
// BLOCKING: true
// WHY: Frontend files changed but the public site was never screenshot-verified.
//      Changes to HTML/CSS/JS that are deployed to a public URL must be visually
//      confirmed on the live site, not just localhost.
//
// INCIDENT HISTORY:
//   2026-05-18: CSS changes looked correct locally but rendered broken on public
//   site due to CDN caching. Screenshot verification would have caught it.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function _log(obj) {
  obj.ts = new Date().toISOString();
  obj.module = "screenshot-public-site-gate";
  obj.event = "Stop";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n"); } catch (e) {}
}

var FRONTEND_EDIT_PATTERNS = [
  /["']file_path["']\s*:\s*["'][^"']*\.(html|css)\b/i,
  /\.(html|css)\b.*\b(Edit|Write)\b/i,
  /\b(Edit|Write)\b.*\.(html|css)\b/i,
];

var PUBLIC_URL_INDICATORS = [
  /s3:\/\//i,
  /cloudfront/i,
  /tokentracker\.click/i,
];

var SCREENSHOT_EVIDENCE = [
  /browser_take_screenshot/i,
  /\/tmp\/dash[^"'\s]*.png/i,
  /tokentracker\.click/i,
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

  var hasPublicUrl = matchesAny(transcript, PUBLIC_URL_INDICATORS);
  if (!hasPublicUrl) {
    _log({ result: "pass", reason: "no public URL indicators" });
    return null;
  }

  var hasFrontendEdits = matchesAny(transcript, FRONTEND_EDIT_PATTERNS);
  if (!hasFrontendEdits) {
    _log({ result: "pass", reason: "no frontend edits" });
    return null;
  }

  var hasScreenshot = matchesAny(transcript, SCREENSHOT_EVIDENCE);
  if (hasScreenshot) {
    _log({ result: "pass", reason: "screenshot evidence found" });
    return null;
  }

  _log({ result: "block", reason: "frontend changed, no screenshot of public site" });
  return {
    decision: "block",
    reason: "BLOCKED: Deployment requires screenshot verification of frontend changes on the public site\nWHY: Unverified frontend changes have shipped to production, causing visual regressions or broken layouts that users encountered before the team noticed\nNEXT STEPS:\n1. Take screenshots of the affected pages and compare them against the baseline\n2. Update or approve the screenshots in the verification system to proceed\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix screenshot-public-site-gate — {describe the issue}\""
  };
};
