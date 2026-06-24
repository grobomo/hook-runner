// TOOLS: SessionStart
// WORKFLOW: shtd, starter
// WHY: Other sessions make undocumented changes to hook infrastructure overnight.
// When those changes break things, there's no audit trail. This module detects
// changes not logged in decisions.jsonl and flags them at session start. T778.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ UNAUTHORIZED CHANGE CHECK — Detect undocumented hook drift             │
// │                                                                        │
// │ On session start, compares current hook files against the last          │
// │ snapshot SHA256s. Cross-references any changes with decisions.jsonl.    │
// │ Undocumented changes are flagged via stderr.                           │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-06-01: T759 exit(0) change in run-stop.js was made by a        │
// │   previous session without logging WHY. Caused infinite loop. T778.    │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var DECISIONS_PATH = path.join(HOOKS_DIR, "decisions.jsonl");
var SNAPSHOT_PATH = path.join(HOOKS_DIR, "snapshot-hashes.json");
var LOG_PATH = path.join(HOOKS_DIR, "hook-log.jsonl");

function _log(action, detail) {
  try {
    var entry = JSON.stringify({
      ts: new Date().toISOString(),
      module: "unauthorized-change-check",
      action: action,
      detail: (detail || "").substring(0, 300)
    }) + "\n";
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) { /* best effort */ }
}

function sha256(filePath) {
  try {
    var content = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch (e) { return null; }
}

// Key hook infrastructure files to track
function getTrackedFiles() {
  var files = [];
  // Runners
  var runners = ["run-stop.js", "run-pretooluse.js", "run-posttooluse.js",
                 "run-sessionstart.js", "run-userpromptsubmit.js", "run-hidden.js"];
  for (var i = 0; i < runners.length; i++) {
    var rp = path.join(HOOKS_DIR, runners[i]);
    if (fs.existsSync(rp)) files.push(rp);
  }
  // Core files
  var core = ["load-modules.js", "hook-log.js", "run-async.js", "constants.js",
              "haiku-client.js", "workflow.js"];
  for (var j = 0; j < core.length; j++) {
    var cp2 = path.join(HOOKS_DIR, core[j]);
    if (fs.existsSync(cp2)) files.push(cp2);
  }
  // Stop rules — T806: check new path first, fallback to old
  var rulesPath = path.join(HOME, ".claude", "hooks", "rules", "stop-haiku-rules.yaml");
  if (!fs.existsSync(rulesPath)) rulesPath = path.join(HOME, ".claude", "proxy", "stop-haiku-rules.yaml");
  if (fs.existsSync(rulesPath)) files.push(rulesPath);
  return files;
}

// Check if a file change is documented in decisions.jsonl (last 7 days)
function isDocumented(basename) {
  try {
    var content = fs.readFileSync(DECISIONS_PATH, "utf-8");
    var lines = content.trim().split("\n");
    var cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (var i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
      try {
        var entry = JSON.parse(lines[i]);
        if (entry.file_changed && entry.file_changed.indexOf(basename) !== -1) {
          var entryTs = new Date(entry.ts).getTime();
          if (entryTs > cutoff) return true;
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* no file */ }
  return false;
}

module.exports = function(input) {
  var trackedFiles = getTrackedFiles();
  if (trackedFiles.length === 0) return null;

  // Load or create snapshot
  var snapshot = {};
  try { snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8")); } catch (e) { /* first run */ }

  var changes = [];
  var newSnapshot = {};

  for (var i = 0; i < trackedFiles.length; i++) {
    var fp = trackedFiles[i];
    var basename = path.basename(fp);
    var hash = sha256(fp);
    if (!hash) continue;

    newSnapshot[basename] = hash;

    if (snapshot[basename] && snapshot[basename] !== hash) {
      // File changed since last snapshot
      if (!isDocumented(basename)) {
        changes.push(basename);
      }
    }
  }

  // Save new snapshot
  try {
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(newSnapshot, null, 2));
  } catch (e) { /* best effort */ }

  if (changes.length > 0) {
    var msg = "UNAUTHORIZED CHANGE ALERT: " + changes.length + " hook file(s) changed without decision log:\n" +
      changes.map(function(c) { return "  - " + c; }).join("\n") + "\n" +
      "These changes were made by another session without documenting WHY.\n" +
      "Review each change, verify it's correct, and add a decisions.jsonl entry.\n";
    _log("alert", changes.join(", "));
    process.stderr.write(msg);
  } else if (Object.keys(snapshot).length > 0) {
    _log("pass", "No undocumented changes detected");
  } else {
    _log("init", "First run — baseline snapshot created for " + trackedFiles.length + " files");
  }

  return null;
};
