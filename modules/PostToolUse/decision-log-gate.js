// TOOLS: Edit, Write
// WORKFLOW: shtd, starter
// WHY: The T759 exit(0) disaster happened because a previous session changed
// run-stop.js re-entrant guard behavior without documenting WHY. When it broke,
// there was no audit trail — just a broken system. This gate ensures every
// hook infrastructure change has a decision log entry. T777.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ DECISION LOG GATE — Audit trail for hook behavioral changes            │
// │                                                                        │
// │ When Claude edits hook infrastructure (runners, modules, stop rules,   │
// │ proxy config), checks if a matching entry exists in decisions.jsonl.   │
// │ Non-blocking (PostToolUse) — emits warning via stderr.                 │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-05-30: T759 — session changed exit(0)→exit(1) in run-stop.js   │
// │   re-entrant guard without documenting WHY. Caused infinite loop.      │
// │   No audit trail to understand the original reasoning. T777.           │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var DECISIONS_PATH = path.join(HOME, ".claude", "hooks", "decisions.jsonl");
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var SESSION = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);

function _log(action, detail) {
  try {
    var entry = JSON.stringify({
      ts: new Date().toISOString(),
      module: "decision-log-gate",
      action: action,
      detail: (detail || "").substring(0, 300)
    }) + "\n";
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) { /* best effort */ }
}

// Check if path is hook infrastructure
function isHookInfra(filePath) {
  var norm = filePath.replace(/\\/g, "/");
  if (norm.indexOf("/run-modules/") !== -1) return "module";
  if (/\/run-[a-z]+\.js$/.test(norm) && norm.indexOf("/.claude/hooks/") !== -1) return "runner";
  if (norm.indexOf("/.claude/hooks/") !== -1) {
    var base = path.basename(norm);
    if (base === "load-modules.js" || base === "workflow.js" || base === "hook-log.js" ||
        base === "run-async.js" || base === "constants.js") return "core";
  }
  if (/stop-haiku-rules\.ya?ml$/.test(norm)) return "stop-rules";
  if (/\.claude\/proxy\/.*\.ya?ml$/.test(norm)) return "proxy-config";
  return null;
}

// Check if a decision log entry exists for this file in the current session
function hasDecisionEntry(filePath) {
  try {
    var content = fs.readFileSync(DECISIONS_PATH, "utf-8");
    var lines = content.trim().split("\n");
    var basename = path.basename(filePath);
    // Check last 20 entries (most recent)
    var start = Math.max(0, lines.length - 20);
    for (var i = start; i < lines.length; i++) {
      try {
        var entry = JSON.parse(lines[i]);
        if (entry.session === SESSION && entry.file_changed &&
            entry.file_changed.indexOf(basename) !== -1) {
          return true;
        }
      } catch (e) { /* skip malformed */ }
    }
  } catch (e) {
    // File doesn't exist yet — that's fine, just means no entries
  }
  return false;
}

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var ti = input.tool_input || {};
  var filePath = (ti.file_path || "").replace(/\\/g, "/");
  if (!filePath) return null;

  var infraType = isHookInfra(filePath);
  if (!infraType) return null;

  // Check if decision entry exists
  if (hasDecisionEntry(filePath)) {
    _log("pass", infraType + ": " + path.basename(filePath) + " has decision entry");
    return null;
  }

  // No decision entry — warn
  var basename = path.basename(filePath);
  var msg = "DECISION LOG WARNING: Hook infrastructure edited without decision log entry.\n" +
    "File: " + basename + " (" + infraType + ")\n" +
    "Session: " + SESSION + "\n\n" +
    "Write a decision entry BEFORE your next edit:\n" +
    "  Append to " + DECISIONS_PATH + ":\n" +
    '  {"what":"<what you changed>","why":"<why this change>","risk":"<what could break>",' +
    '"alternative_considered":"<other approach>","ts":"' + new Date().toISOString() + '",' +
    '"session":"' + SESSION + '","file_changed":"' + basename + '"}\n';

  _log("warn", infraType + ": " + basename + " missing decision entry");
  process.stderr.write(msg);

  return null;
};
