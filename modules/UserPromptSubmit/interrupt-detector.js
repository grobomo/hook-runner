// WORKFLOW: shtd
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

  // Log the interrupt
  var logPath = path.join(home, ".claude/self-analysis.log");
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  try {
    var entry = "[" + new Date().toISOString() + "] INTERRUPT detected" +
      " | project=" + projectDir +
      " | user=" + userPrompt.substring(0, 300) + "\n";
    fs.appendFileSync(logPath.replace(/\//g, path.sep), entry);
  } catch (e) {}

  // Spawn background self-analysis via VBS wrapper (no visible window on Windows)
  var scriptPath = home + "/.claude/scripts/self-analyze-loop.js";
  try {
    fs.statSync(scriptPath.replace(/\//g, path.sep));
  } catch (e) {
    return; // script not installed
  }

  try {
    // Write args to a temp JSON file — avoids quote escaping nightmares in VBS/cmd.
    // The self-analyze-loop.js reads this file instead of process.argv.
    var argsFile = path.join(os.tmpdir(), "claude-analyze-args-" + Date.now() + ".json");
    fs.writeFileSync(argsFile, JSON.stringify({
      projectDir: projectDir,
      userCorrection: userPrompt.substring(0, 500)
    }));

    if (process.platform === "win32") {
      // Use wscript.exe with a VBS wrapper to hide the window completely.
      // node.exe + detached + windowsHide still flashes a console.
      var vbs = path.join(os.tmpdir(), "claude-analyze.vbs");
      var nodePath = scriptPath.replace(/\//g, "\\");
      var argsPath = argsFile.replace(/\//g, "\\");
      // Redirect stderr to log so VBS errors don't pop up silently
      var errLog = path.join(home, ".claude/self-analysis-errors.log").replace(/\//g, "\\");
      fs.writeFileSync(vbs,
        'Set ws = CreateObject("WScript.Shell")\n' +
        'ws.Run "cmd /c node ""' + nodePath + '"" ""' + argsPath + '"" 2>>""' + errLog + '""", 0, False\n');
      cp.spawn("wscript.exe", [vbs], { detached: true, stdio: "ignore" }).unref();
    } else {
      cp.spawn("node", [
        scriptPath, argsFile
      ], { detached: true, stdio: "ignore" }).unref();
    }
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
