// TOOLS: Stop
// WORKFLOW: starter
// BLOCKING: true
// WHY: User asks "what was last step done" then interrupts with a new directive.
// The original request is silently dropped. Nobody notices. This module detects
// pending requests from .pending-requests-{session}.json (written by UPS runner
// via T802) and flags them at Stop time so they aren't forgotten.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ ABANDONED REQUEST CHECK — Flags unanswered user requests at Stop       │
// │                                                                        │
// │ Fires on: every Stop event                                             │
// │ Reads: ~/.claude/hooks/.pending-requests-{session}.json                │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-06-02: User asked "what's next", Claude started reading TODO,   │
// │   user interrupted with "make a todo for X". First question silently   │
// │   dropped. User noticed hours later.                                   │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";
var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var HOOK_LOG = path.join(HOOKS_DIR, "hook-log.jsonl");

function log(action, detail) {
  try {
    fs.appendFileSync(HOOK_LOG, JSON.stringify({
      ts: new Date().toISOString(),
      module: "abandoned-request-check",
      event: "Stop",
      action: action,
      detail: detail
    }) + "\n");
  } catch (e) {}
}

module.exports = function(input) {
  var sessionId = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
  var pendingFile = path.join(HOOKS_DIR, ".pending-requests-" + sessionId + ".json");

  // No pending file = no tracked requests
  if (!fs.existsSync(pendingFile)) {
    return null;
  }

  var data;
  try {
    data = JSON.parse(fs.readFileSync(pendingFile, "utf-8"));
  } catch (e) {
    return null;
  }

  // No requests or empty array
  if (!data || !Array.isArray(data.requests) || data.requests.length === 0) {
    return null;
  }

  // Skip expired requests (>30 min old — matches todo-first-gate expiry)
  if (data.ts && (Date.now() - new Date(data.ts).getTime()) > 30 * 60 * 1000) {
    log("skip", "expired pending requests (" + data.requests.length + ")");
    return null;
  }

  // Check if requests were tracked in TODO.md (same logic as todo-first-gate)
  var projDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    var todoPath = path.join(projDir, "TODO.md");
    if (fs.existsSync(todoPath)) {
      var todoContent = fs.readFileSync(todoPath, "utf-8").toLowerCase();
      var untracked = [];
      for (var i = 0; i < data.requests.length; i++) {
        var keywords = data.requests[i].toLowerCase()
          .split(/\s+/)
          .filter(function(w) {
            return w.length > 3 && !/^(the|and|for|with|this|that|from|into|when|what|will|should|must|have|been|also|then|just)$/.test(w);
          });
        var matched = 0;
        for (var k = 0; k < keywords.length; k++) {
          if (todoContent.indexOf(keywords[k]) >= 0) matched++;
        }
        if (matched < Math.min(2, keywords.length)) {
          untracked.push(data.requests[i]);
        }
      }

      if (untracked.length === 0) {
        // All requests tracked — clean up
        try { fs.unlinkSync(pendingFile); } catch (e) {}
        log("pass", "all requests tracked in TODO.md");
        return null;
      }

      log("warn", untracked.length + " untracked request(s)");

      return {
        decision: "block",
        reason: "SELF-CHECK [abandoned-requests]: CONTINUE — " + untracked.length +
          " user request(s) not yet tracked in TODO.md:\n" +
          untracked.map(function(r, i) { return "  " + (i + 1) + ". " + r; }).join("\n") +
          "\nAdd these to TODO.md before stopping.\n" +
          "FALSE POSITIVE? File a TODO in hook-runner: \"Fix abandoned-request-check — {describe the issue}\""
      };
    }
  } catch (e) {}

  // No TODO.md — flag all requests
  log("warn", data.requests.length + " pending request(s), no TODO.md");

  return {
    decision: "block",
    reason: "SELF-CHECK [abandoned-requests]: CONTINUE — " + data.requests.length +
      " user request(s) still pending:\n" +
      data.requests.map(function(r, i) { return "  " + (i + 1) + ". " + r; }).join("\n") +
      "\nTrack these in TODO.md or complete them before stopping.\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix abandoned-request-check — {describe the issue}\""
  };
};
