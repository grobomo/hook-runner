// TOOLS: Edit, Write
// WORKFLOW: shtd, starter, haiku-rules
// WHY: TODO.md and docs/ changes were left uncommitted across sessions,
// losing tracked decisions and audit history on context reset.
// T791: Remind to commit documentation changes periodically.
//
// INCIDENT HISTORY:
//   2026-06-01: TODO.md had 40+ uncommitted changes spanning 3 sessions.
//   Context reset lost the session state because TODO.md wasn't committed.
//
// PostToolUse (non-blocking): After Edit/Write to TODO.md or docs/*,
// checks git status and reminds via stderr if uncommitted docs exist.
// Cooldown: reminds at most once per 15 minutes to avoid spam.
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var _LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");
function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "git-commit-reminder-check";
  try { fs.appendFileSync(_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch(e) {}
}

var TRACKED_PATTERNS = [
  /TODO\.md$/,
  /CHANGELOG\.md$/,
  /\/docs\//,
  /\/specs\//,
  /SESSION_STATE\.md$/,
];

// Cooldown: flag file per session so we remind at most once per 15 min
var sessionId = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
var COOLDOWN_FILE = path.join(os.tmpdir(), "git-commit-reminder-" + sessionId);
var COOLDOWN_MS = 15 * 60 * 1000;

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var filePath = "";
  try {
    var ti = input.tool_input || {};
    filePath = (ti.file_path || "").replace(/\\/g, "/");
  } catch (e) { return null; }

  if (!filePath) return null;

  // Only fire for tracked documentation files
  var isTracked = false;
  for (var i = 0; i < TRACKED_PATTERNS.length; i++) {
    if (TRACKED_PATTERNS[i].test(filePath)) { isTracked = true; break; }
  }
  if (!isTracked) return null;

  // Cooldown check
  try {
    var stat = fs.statSync(COOLDOWN_FILE);
    if (Date.now() - stat.mtimeMs < COOLDOWN_MS) {
      _log({ event: "PostToolUse", result: "skip", reason: "cooldown" });
      return null;
    }
  } catch (e) { /* no cooldown file = first time */ }

  // Find git root for the edited file
  var dir = path.dirname(filePath.replace(/\//g, path.sep));
  var gitRoot;
  try {
    gitRoot = cp.execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir, timeout: 3000, encoding: "utf-8"
    }).trim();
  } catch (e) {
    _log({ event: "PostToolUse", result: "skip", reason: "no-git-root" });
    return null;
  }

  // Check for uncommitted doc files
  var status;
  try {
    status = cp.execFileSync("git", ["status", "--porcelain"], {
      cwd: gitRoot, timeout: 3000, encoding: "utf-8"
    }).trim();
  } catch (e) { return null; }

  if (!status) return null;

  var lines = status.split("\n");
  var uncommittedDocs = [];
  for (var j = 0; j < lines.length; j++) {
    var file = lines[j].substring(3).trim();
    for (var k = 0; k < TRACKED_PATTERNS.length; k++) {
      if (TRACKED_PATTERNS[k].test(file)) {
        uncommittedDocs.push(file);
        break;
      }
    }
  }

  if (uncommittedDocs.length === 0) return null;

  // Write cooldown marker
  try { fs.writeFileSync(COOLDOWN_FILE, Date.now().toString()); } catch (e) {}

  _log({ event: "PostToolUse", result: "remind", count: uncommittedDocs.length, files: uncommittedDocs.slice(0, 5) });

  // Non-blocking reminder via stderr
  process.stderr.write(
    "[git-commit-reminder-check] " + uncommittedDocs.length +
    " uncommitted doc file(s): " + uncommittedDocs.slice(0, 3).join(", ") +
    (uncommittedDocs.length > 3 ? " (+" + (uncommittedDocs.length - 3) + " more)" : "") +
    ". Consider committing.\n"
  );

  return null; // never block
};
