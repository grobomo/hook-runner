// TOOLS: Bash
// WORKFLOW: haiku-rules
// WHY: Dispatcher ran health/poll commands but never reviewed its own system health.
// Frustration logs piled up, self-healing findings went unread, stop rules misfired
// without correction — because nobody checked. This module surfaces health signals
// after poll/health commands.
// T816: PostToolUse — self-analysis on poll/health.
//
// INCIDENT HISTORY:
//   2026-06-04: Frustration log had 12 entries spanning 3 hours — never reviewed.
//   Self-healing-findings.json had 4 items — never surfaced.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var HOME = os.homedir();
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var LOG_PATH = path.join(HOOKS_DIR, "hook-log.jsonl");
var FRUSTRATION_LOG = path.join(HOOKS_DIR, "frustration-log.jsonl");
var SELF_HEALING = path.join(HOOKS_DIR, ".self-healing-findings.json");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "self-analysis-check";
  entry.event = "PostToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

function isDispatcherProject() {
  var cwd = process.cwd().replace(/\\/g, "/").toLowerCase();
  return cwd.indexOf("request-tracker") >= 0;
}

function checkFrustrationLog() {
  try {
    var stat = fs.statSync(FRUSTRATION_LOG);
    var ageMs = Date.now() - stat.mtimeMs;
    var ageHours = ageMs / 3600000;
    if (ageHours < 1) {
      // Recent frustration — count entries in last hour
      var lines = fs.readFileSync(FRUSTRATION_LOG, "utf-8").trim().split("\n");
      var recentCount = 0;
      var cutoff = Date.now() - 3600000;
      for (var i = lines.length - 1; i >= 0 && i >= lines.length - 50; i--) {
        try {
          var entry = JSON.parse(lines[i]);
          if (new Date(entry.ts).getTime() > cutoff) recentCount++;
        } catch (e) {}
      }
      if (recentCount > 0) {
        return "Frustration log: " + recentCount + " entries in last hour (review with: tail -5 frustration-log.jsonl)";
      }
    }
  } catch (e) {}
  return null;
}

function checkSelfHealing() {
  try {
    var data = JSON.parse(fs.readFileSync(SELF_HEALING, "utf-8"));
    var findings = data.findings || [];
    var unresolved = findings.filter(function(f) { return !f.resolved; });
    if (unresolved.length > 0) {
      return "Self-healing: " + unresolved.length + " unresolved findings";
    }
  } catch (e) {}
  return null;
}

function checkRecentStopMismatches() {
  try {
    var lines = fs.readFileSync(LOG_PATH, "utf-8").trim().split("\n");
    var mismatches = 0;
    var cutoff = Date.now() - 3600000;
    for (var i = lines.length - 1; i >= 0 && i >= lines.length - 200; i--) {
      try {
        var entry = JSON.parse(lines[i]);
        if (new Date(entry.ts).getTime() < cutoff) break;
        if (entry.module === "hook-runner-watchdog" && entry.event === "Stop" &&
            (entry.mismatch || entry.contradiction)) {
          mismatches++;
        }
      } catch (e) {}
    }
    if (mismatches > 0) {
      return "Watchdog: " + mismatches + " stop decision mismatches in last hour";
    }
  } catch (e) {}
  return null;
}

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  if (input.tool_name !== "Bash") return null;
  if (!isDispatcherProject()) return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  // Only fire after health/poll/status commands
  if (!/manage\.py\s+(poll|status|heartbeat|health|supervise)/i.test(cmd) &&
      !/self-check/i.test(cmd)) {
    return null;
  }

  var issues = [];
  var frustration = checkFrustrationLog();
  if (frustration) issues.push(frustration);
  var healing = checkSelfHealing();
  if (healing) issues.push(healing);
  var mismatches = checkRecentStopMismatches();
  if (mismatches) issues.push(mismatches);

  if (issues.length === 0) {
    _log({ result: "pass", reason: "all_healthy" });
    return null;
  }

  _log({ result: "advisory", reason: "health_issues", count: issues.length });
  process.stderr.write("[self-analysis-check] Health signals:\n  - " + issues.join("\n  - ") + "\n");
  return null; // PostToolUse never blocks
};
