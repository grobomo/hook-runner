// WHY: User interrupts are social cues that Claude did something wrong.
// In real life, people correct you with raised eyebrows or "wait, no."
// In TUI, the interrupt IS that signal. When detected, this spawns a
// background self-analysis loop (claude -p) that reflects on what went
// wrong and commits lessons to git for future sessions.
//
// Detection: Stop hook writes .claude-turn-complete marker. If that
// marker is missing when a new prompt arrives, the previous turn was
// interrupted (Claude didn't finish normally).
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var MARKER = path.join(os.tmpdir(), ".claude-turn-complete");
var COOLDOWN_FILE = path.join(os.tmpdir(), ".claude-self-analyze-cooldown");
var COOLDOWN_MS = 60000; // Don't spam analysis — 1 min cooldown
var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");

function isInterrupt() {
  try {
    fs.statSync(MARKER);
    // Marker exists — previous turn completed normally. Clear it for next turn.
    fs.unlinkSync(MARKER);
    return false;
  } catch (e) {
    // Marker missing — previous turn was interrupted (or first prompt of session)
    return true;
  }
}

function isFirstPrompt() {
  // Check prompt log — if fewer than 2 entries in the last minute, this is
  // likely the first prompt of the session, not an interrupt
  var logPath = path.join(home, ".claude/hooks/prompt-log.jsonl");
  try {
    var content = fs.readFileSync(logPath, "utf-8");
    var lines = content.trim().split("\n");
    if (lines.length < 2) return true;
    var last = JSON.parse(lines[lines.length - 1]);
    var age = Date.now() - new Date(last.ts).getTime();
    // If last prompt was more than 5 minutes ago, this is a new session
    return age > 300000;
  } catch (e) {
    return true;
  }
}

function onCooldown() {
  try {
    var stat = fs.statSync(COOLDOWN_FILE);
    return (Date.now() - stat.mtimeMs) < COOLDOWN_MS;
  } catch (e) {
    return false;
  }
}

function spawnAnalysis(userPrompt) {
  // Write cooldown marker
  try { fs.writeFileSync(COOLDOWN_FILE, Date.now().toString()); } catch(e) {}

  var scriptPath = home + "/.claude/scripts/self-analyze-loop.js";
  try {
    fs.statSync(scriptPath.replace(/\//g, path.sep));
  } catch (e) {
    return; // script not installed
  }

  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  try {
    var opts = { stdio: "ignore", detached: true };
    if (process.platform === "win32") opts.windowsHide = true;
    var child = cp.spawn("node", [
      scriptPath,
      projectDir,
      userPrompt.substring(0, 500)  // pass the corrective message for context
    ], opts);
    child.unref();
  } catch (e) {
    // silent fail
  }
}

module.exports = function(input) {
  try {
    var prompt = "";
    if (input && input.message && typeof input.message === "string") {
      prompt = input.message;
    } else if (input && input.prompt && typeof input.prompt === "string") {
      prompt = input.prompt;
    }

    if (!isInterrupt()) return null;  // normal turn completion
    if (isFirstPrompt()) return null; // session start, not interrupt
    if (onCooldown()) return null;    // already analyzing

    // Interrupt detected — spawn background analysis
    spawnAnalysis(prompt);
  } catch (e) {
    // Never fail
  }
  return null;
};
