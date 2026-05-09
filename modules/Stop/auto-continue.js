// WORKFLOW: shtd, gsd, starter
// WHY: Claude stops and lists options instead of doing the work.
// The message text in stop-message.txt was iterated over 15+ versions by the user.
// DO NOT rewrite, condense, or rephrase it. It is a user-authored artifact.
// If you need to change behavior, modify THIS CODE, not the message file.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var os = require("os");

var API_ERROR_PATTERNS = [
  /API\s*Error/i,
  /Unable to connect/i,
  /overloaded/i,
  /\b503\b/,
  /Service\s*Unavailable/i,
  /rate.limit/i,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /socket hang up/i
];

var API_CHECK_SCRIPT = "/mnt/c/Users/joelg/Documents/ProjectsCL1/_grobomo/context-reset/api_check.py";
var LOCK_PATH = path.join(os.tmpdir(), "api-check-watcher.lock");
var LOCK_MAX_AGE_MS = 1800000; // 30 min — stale lock cleanup

function getLastAssistantMessage() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return "";
  var slug = path.resolve(projectDir).replace(/[^a-zA-Z0-9-]/g, "-");
  var logsDir = path.join(os.homedir(), ".claude", "projects", slug);
  if (!fs.existsSync(logsDir)) return "";
  var files;
  try { files = fs.readdirSync(logsDir).filter(function(f) { return f.endsWith(".jsonl"); }); }
  catch (e) { return ""; }
  if (files.length === 0) return "";
  var newest = files.reduce(function(a, b) {
    var at = 0, bt = 0;
    try { at = fs.statSync(path.join(logsDir, a)).mtimeMs; } catch(e) {}
    try { bt = fs.statSync(path.join(logsDir, b)).mtimeMs; } catch(e) {}
    return at > bt ? a : b;
  });
  var lines;
  try {
    var content = fs.readFileSync(path.join(logsDir, newest), "utf-8");
    lines = content.trim().split("\n");
  } catch(e) { return ""; }
  for (var i = lines.length - 1; i >= 0 && i >= lines.length - 20; i--) {
    try {
      var entry = JSON.parse(lines[i]);
      if (entry.type === "assistant" && entry.message && entry.message.content) {
        var parts = entry.message.content;
        if (typeof parts === "string") return parts;
        if (Array.isArray(parts)) {
          return parts.map(function(p) { return p.text || ""; }).join(" ");
        }
      }
    } catch(e) {}
  }
  return "";
}

function hasApiErrorPattern(text) {
  for (var i = 0; i < API_ERROR_PATTERNS.length; i++) {
    if (API_ERROR_PATTERNS[i].test(text)) return true;
  }
  return false;
}

function spawnApiWatcher(projectDir) {
  if (!fs.existsSync(API_CHECK_SCRIPT)) return;
  // Prevent duplicate watchers via lock file
  try {
    if (fs.existsSync(LOCK_PATH)) {
      var age = Date.now() - fs.statSync(LOCK_PATH).mtimeMs;
      if (age < LOCK_MAX_AGE_MS) return; // recent watcher already running
      fs.unlinkSync(LOCK_PATH); // stale lock
    }
    fs.writeFileSync(LOCK_PATH, String(process.pid));
  } catch(e) { return; }
  try {
    cp.spawn("python3", [API_CHECK_SCRIPT, "--watch", projectDir], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
  } catch(e) {}
}

module.exports = function(input) {
  // Preserved-tab mode: context reset opened a new tab and kept this one
  // for user review. Don't keep working — just stay idle.
  var idleFlag = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", ".preserved-tab-idle");
  if (fs.existsSync(idleFlag)) {
    try { fs.unlinkSync(idleFlag); } catch(e) {} // One-shot: remove after reading
    return null; // Allow stop — don't block with "keep working" message
  }

  // T635: Detect API errors in last assistant message → spawn recovery watcher
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (projectDir) {
    var lastMsg = getLastAssistantMessage();
    if (lastMsg && hasApiErrorPattern(lastMsg)) {
      spawnApiWatcher(projectDir);
    }
  }

  // Read message from external file — separated so code changes can't
  // accidentally alter the carefully iterated user-authored prompt
  var msgPath = path.join(__dirname, "stop-message.txt");
  var message;
  try {
    message = fs.readFileSync(msgPath, "utf-8").trim();
  } catch (e) {
    message = "DO NOT STOP. Check TODO.md for pending tasks and do the next one.";
  }

  return {
    decision: "block",
    reason: message
  };
};
