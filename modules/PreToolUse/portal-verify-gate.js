// TOOLS: Edit, Write
// WORKFLOW: haiku-rules
// WHY: Cost validation tasks were marked "validated" using stale cached data
//      without opening the RONE portal. This gate blocks TODO.md edits that
//      mark cost validation tasks complete unless portal evidence exists.
//
// INCIDENT HISTORY:
//   2026-05-19: T205d marked "validated" using $200 estimate from previous
//   session. No portal was opened. Rate calculation built on unverified data.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var EVIDENCE_PATH = process.env.PORTAL_EVIDENCE_PATH || "/tmp/.hook-runner-portal-evidence.json";
var TTL_MS = 30 * 60 * 1000;

function _log(obj) {
  obj.ts = new Date().toISOString();
  obj.module = "portal-verify-gate";
  obj.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n"); } catch (e) {}
}

var COST_MARKERS = [
  /T205[de]/i,
  /\bcost\s*validat/i,
  /\breconcil/i,
  /\bportal\s+(data\s+)?match/i,
  /\brate\s*.*verif/i,
  /\bpricing\s*.*confirm/i,
];

// T730 fix: only match ACTUAL checkboxes (line start), not [x] in prose descriptions.
// Old pattern matched "portal-verify-gate checks [x] AND cost" in TODO descriptions.
var COMPLETION_MARKERS = [
  /^\s*[-*]\s*\[x\]/i,
  /\bvalidated\b/i,
  /\bconfirmed\b/i,
  /\bverified\b/i,
];

function isCostValidationCompletion(content) {
  var lines = content.split("\n");
  for (var k = 0; k < lines.length; k++) {
    var line = lines[k];
    var hasCost = false;
    var hasCompletion = false;
    for (var i = 0; i < COST_MARKERS.length; i++) {
      if (COST_MARKERS[i].test(line)) { hasCost = true; break; }
    }
    if (!hasCost) continue;
    for (var j = 0; j < COMPLETION_MARKERS.length; j++) {
      if (COMPLETION_MARKERS[j].test(line)) { hasCompletion = true; break; }
    }
    if (hasCompletion) return true;
  }
  return false;
}

function hasRecentEvidence() {
  try {
    var raw = fs.readFileSync(EVIDENCE_PATH, "utf-8");
    var entries = JSON.parse(raw);
    if (!Array.isArray(entries)) entries = [entries];
    var now = Date.now();
    var sessionId = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
    for (var i = entries.length - 1; i >= 0; i--) {
      var e = entries[i];
      if (!e.ts) continue;
      var age = now - new Date(e.ts).getTime();
      if (age > TTL_MS) continue;
      if (e.session_id === sessionId) return true;
    }
    return false;
  } catch (e) { return false; }
}

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var filePath = ((input.tool_input || {}).file_path || "");
  if (!filePath || !(/TODO\.md$/i.test(filePath))) return null;

  var content = (input.tool_input || {}).new_string || (input.tool_input || {}).content || "";
  if (!content) return null;

  if (!isCostValidationCompletion(content)) {
    _log({ result: "pass", reason: "not a cost validation completion" });
    return null;
  }

  // T848: For Edit operations, check if the cost validation completion already existed
  // in old_string. If so, this is an append/context edit, not a new completion.
  if (tool === "Edit") {
    var oldString = (input.tool_input || {}).old_string || "";
    if (oldString && isCostValidationCompletion(oldString)) {
      _log({ result: "pass", reason: "cost completion pre-existed in old_string (append)" });
      return null;
    }
  }

  if (hasRecentEvidence()) {
    _log({ result: "pass", reason: "portal evidence found" });
    return null;
  }

  _log({ result: "block", reason: "cost validation without portal evidence" });
  return {
    decision: "block",
    reason: "BLOCKED: Marking cost validation task complete without fresh portal verification\nWHY: Stale cached data was used to mark validation tasks as complete, bypassing actual cost verification\nNEXT STEPS:\n1. Refresh portal data cache before re-attempting validation\n2. Verify task status directly in portal UI to confirm current state\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix portal-verify-gate — {describe the issue}\""
  };
};
