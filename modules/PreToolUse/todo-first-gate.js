// TOOLS: Edit, Write, Bash
// WORKFLOW: starter, haiku-rules
// WHY: Claude frequently starts coding before writing a TODO entry for the user's
// request. This means work is untracked, unsearchable, and lost on context reset.
// The user directive "Always write TODOs to file before starting work" was ignored
// because it was just text in CLAUDE.md. This gate enforces it mechanically.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ TODO-FIRST GATE — Blocks work until user requests are in TODO.md       │
// │                                                                        │
// │ Fires when: Edit/Write/Bash targets non-TODO files while pending       │
// │             requests exist (written by UPS runner after Haiku triage)   │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-06-02: User said "design a system where you monitor whatever    │
// │   is happening" — Claude immediately wrote code without a TODO entry.  │
// │   Deployed untested. This pattern repeats nearly every session.        │
// │   T802 spec: two-gate handshake (UPS writes requests, PreToolUse       │
// │   blocks until tracked).                                               │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";
var fs = require("fs");
var path = require("path");

var HOOKS_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks");
var LOG_PATH = path.join(HOOKS_DIR, "hook-log.jsonl");

function log(action, details) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      module: "todo-first-gate",
      action: action,
      details: details
    }) + "\n");
  } catch (e) { /* best effort */ }
}

function getPendingFile() {
  var sessionId = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
  return path.join(HOOKS_DIR, ".pending-requests-" + sessionId + ".json");
}

function readPending() {
  try {
    var data = JSON.parse(fs.readFileSync(getPendingFile(), "utf-8"));
    if (!data || !Array.isArray(data.requests) || data.requests.length === 0) return null;
    // Expire after 30 min
    if (data.ts && (Date.now() - new Date(data.ts).getTime()) > 30 * 60 * 1000) return null;
    return data;
  } catch (e) { return null; }
}

function isTodoFile(filePath) {
  if (!filePath) return false;
  var norm = filePath.replace(/\\/g, "/").toLowerCase();
  return /\/todo\.md$/i.test(norm) || /^todo\.md$/i.test(norm);
}

function isReadOnly(tool) {
  return tool === "Read" || tool === "Glob" || tool === "Grep" || tool === "WebSearch" ||
    tool === "WebFetch" || tool === "AskUserQuestion" || tool === "TaskCreate" ||
    tool === "TaskUpdate" || tool === "TaskList" || tool === "TaskGet";
}

module.exports = function todoFirstGate(input) {
  var tool = input.tool_name;

  // Read-only tools always pass
  if (isReadOnly(tool)) return null;

  // Only gate Edit, Write, Bash (state-changing tools)
  if (tool !== "Edit" && tool !== "Write" && tool !== "Bash") return null;

  // Check for pending requests
  var pending = readPending();
  if (!pending) return null;

  // Allow TODO.md edits — that's exactly what we want
  var toolInput = input.tool_input || {};
  if (tool === "Edit" || tool === "Write") {
    var filePath = toolInput.file_path || "";
    if (isTodoFile(filePath)) {
      log("pass", "editing TODO.md with pending requests");
      return null;
    }
  }

  // Allow Bash commands that read TODO.md (grep, cat, etc.)
  if (tool === "Bash") {
    var cmd = toolInput.command || "";
    // Allow read-only commands
    if (/^(cat|head|tail|grep|rg|wc|less|more)\b/.test(cmd.trim())) {
      return null;
    }
    // Allow git status/log/diff (informational)
    if (/^\s*git\s+(status|log|diff|show|branch)\b/.test(cmd.trim())) {
      return null;
    }
  }

  // Check if requests are already in TODO.md (fuzzy match)
  var projDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    var todoPath = path.join(projDir, "TODO.md");
    if (fs.existsSync(todoPath)) {
      var todoContent = fs.readFileSync(todoPath, "utf-8").toLowerCase();
      var allTracked = true;
      for (var i = 0; i < pending.requests.length; i++) {
        // Extract keywords from request (words >3 chars)
        var keywords = pending.requests[i].toLowerCase()
          .split(/\s+/)
          .filter(function(w) { return w.length > 3 && !/^(the|and|for|with|this|that|from|into|when|what|will|should|must|have|been|also|then|just)$/.test(w); });
        // Need at least 2 keywords matching in TODO.md
        var matched = 0;
        for (var k = 0; k < keywords.length; k++) {
          if (todoContent.indexOf(keywords[k]) >= 0) matched++;
        }
        if (matched < Math.min(2, keywords.length)) {
          allTracked = false;
          break;
        }
      }
      if (allTracked) {
        // All requests found in TODO.md — clear the lock
        try { fs.unlinkSync(getPendingFile()); } catch (e) {}
        log("pass", "all requests tracked in TODO.md — lock cleared");
        return null;
      }
    }
  } catch (e) {}

  var requestList = pending.requests.map(function(r, i) {
    return "  " + (i + 1) + ". " + r;
  }).join("\n");

  log("block", { requests: pending.requests, tool: tool });

  return {
    decision: "block",
    reason: "BLOCKED: Pending user requests not yet tracked in TODO.md\n" +
      "WHY: Work that isn't tracked in TODO.md gets lost on context reset.\n" +
      "Requests to track:\n" + requestList + "\n" +
      "NEXT STEPS:\n" +
      "1. Add these requests as TODO entries in TODO.md\n" +
      "2. Then continue with your work\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix todo-first-gate — {describe the issue}\""
  };
};
