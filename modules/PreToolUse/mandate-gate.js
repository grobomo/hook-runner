// TOOLS: Bash, Read, Edit, Write, Agent
// WORKFLOW: wsl
// WHY: Haiku directs Opus to continue working (CONTINUE decision at Stop hook),
//      but Opus ignores the stop-hook output and starts unrelated work or drifts.
//      The mandate forces Opus to read and acknowledge Haiku's directive before
//      ANY tool call succeeds — mechanical enforcement, not suggestion.
//
// INCIDENT HISTORY:
//   2026-05-11: Opus consistently ignores stop-hook CONTINUE directives. The
//   stop-analysis-gate and auto-continue-gate produce detailed analysis, but
//   Opus treats the next turn as a fresh start. This gate bridges the gap by
//   blocking the first tool call with the mandate text, forcing acknowledgment.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "/home/ubu";
var MANDATE_PATH = path.join(HOME, ".claude", "hooks", "mandate.json");
var EXPIRY_MS = 10 * 60 * 1000;
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "mandate-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

module.exports = function(input) {
  var state;
  try {
    state = JSON.parse(fs.readFileSync(MANDATE_PATH, "utf-8"));
  } catch (e) {
    return null;
  }

  if (state.created && Date.now() - new Date(state.created).getTime() > EXPIRY_MS) {
    try { fs.unlinkSync(MANDATE_PATH); } catch (e) {}
    log({ result: "expired", age_min: Math.round((Date.now() - new Date(state.created).getTime()) / 60000) });
    return null;
  }

  if (state.seen) {
    return null;
  }

  state.seen = true;
  try { fs.writeFileSync(MANDATE_PATH, JSON.stringify(state, null, 2), "utf-8"); } catch (e) {}

  var actions = state.actions || [];
  var actionText = actions.length > 0
    ? "\n\nNext actions:\n" + actions.map(function(a) { return "- " + a; }).join("\n")
    : "";

  log({ result: "block", source_rule: state.source_rule, decision: state.decision });

  return {
    decision: "block",
    reason: "MANDATE [" + (state.source_rule || "unknown") + "]: " + (state.action || "Continue working.") +
      actionText +
      "\n\nDo this now. Do not ask the user. This tool call was blocked to ensure you read the mandate. Your next tool call will proceed."
  };
};
