// TOOLS: Bash, Read, Edit, Write, Agent
// WORKFLOW: haiku-rules
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
var SESSION_PREFIX = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
var MANDATE_PATH = path.join(HOME, ".claude", "hooks", "mandate-" + SESSION_PREFIX + ".json");
var EXPIRY_MS = 10 * 60 * 1000;
var CHECK_INTERVAL = 5;
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

var haiku;
try { haiku = require(path.join(HOME, ".claude", "hooks", "haiku-client")); } catch (e) {}

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

  // T783: Only enforce mandates for CONTINUE/NEXT decisions, not DONE
  var decision = (state.decision || "").toUpperCase();
  if (decision === "DONE" || decision === "DISPATCH") {
    try { fs.unlinkSync(MANDATE_PATH); } catch (e) {}
    log({ result: "skip_done", decision: decision });
    return null;
  }

  var actions = state.actions || [];
  var actionText = actions.length > 0
    ? "\n\nNext actions:\n" + actions.map(function(a) { return "- " + a; }).join("\n")
    : "";

  if (!state.seen) {
    state.seen = true;
    state.call_count = 0;
    try { fs.writeFileSync(MANDATE_PATH, JSON.stringify(state, null, 2), "utf-8"); } catch (e) {}
    log({ result: "block", source_rule: state.source_rule, decision: state.decision });
    return {
      decision: "block",
      reason: "BLOCKED: First tool call after stop-hook mandate.\nWHY: Haiku directed continuation via CONTINUE decision. You must follow the mandate before proceeding.\nMANDATE: " + (state.action || state.reason || "Follow the stop-hook directive") + actionText + "\nNEXT STEPS:\n1. Read and acknowledge the mandate above\n2. Align your next actions with the directive\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix mandate-gate — {describe the issue}\""
    };
  }

  // Continuous verification: every CHECK_INTERVAL calls, ask Haiku if Opus is on track
  state.call_count = (state.call_count || 0) + 1;
  try { fs.writeFileSync(MANDATE_PATH, JSON.stringify(state, null, 2), "utf-8"); } catch (e) {}

  if (state.call_count % CHECK_INTERVAL !== 0 || !haiku) {
    return null;
  }

  var toolName = (input && input.tool_name) || "unknown";
  var toolInput = "";
  if (input && input.tool_input) {
    try { toolInput = typeof input.tool_input === "string" ? input.tool_input.slice(0, 200) : JSON.stringify(input.tool_input).slice(0, 200); } catch (e) {}
  }

  var prompt = [
    "A mandate was issued: \"" + (state.action || "") + "\"",
    "Actions requested: " + (actions.length > 0 ? actions.join("; ") : "none specified"),
    "The AI has made " + state.call_count + " tool calls since the mandate.",
    "Current tool call: " + toolName + (toolInput ? " — " + toolInput : ""),
    "",
    "Is the AI working toward fulfilling this mandate? Reply JSON:",
    '{"on_track": true|false, "reason": "one sentence"}'
  ].join("\n");

  var result = haiku.call({
    prompt: prompt,
    caller: "mandate-gate-verify",
    jsonMode: true,
    maxTokens: 100,
    timeoutMs: 4000
  });

  if (!result.ok || !result.parsed) {
    log({ result: "verify_fail", call_count: state.call_count, ms: result.ms });
    return null;
  }

  var onTrack = result.parsed.on_track;
  log({ result: onTrack ? "verify_pass" : "verify_block", call_count: state.call_count, on_track: onTrack, reason: result.parsed.reason, ms: result.ms });

  if (onTrack) {
    return null;
  }

  return {
    decision: "block",
    reason: "BLOCKED: Mandate drift detected after " + state.call_count + " calls.\nWHY: Haiku verification found you are not following the stop-hook mandate.\nMANDATE: " + (state.action || state.reason || "Follow the stop-hook directive") + "\nNEXT STEPS:\n1. Re-read the mandate above\n2. Realign your next actions with the directive\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix mandate-gate — {describe the issue}\""
  };
};
