// TOOLS: Edit, Write, Bash
// WORKFLOW: shtd, starter, haiku-rules
// WHY: After user corrections, Claude acknowledges the error but immediately resumes
// the same work pattern without analyzing root cause. The correction evaporates.
// T808: Force reflection in TODO.md before resuming work after corrections.
//
// INCIDENT HISTORY:
// 2026-06-02: T808 — User corrected Claude 3x about the same pattern (writing CLAUDE.md
//   rules instead of gates). Claude said "you're right" each time and continued doing
//   the same thing. The correction-detector caught it but didn't force analysis.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var CORRECTION_LOG = path.join(HOOKS_DIR, "correction-log.jsonl");
var HOOK_LOG = path.join(HOOKS_DIR, "hook-log.jsonl");
var PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Session-scoped flag: tracks whether reflection has been written
var FLAG_FILE = path.join(HOOKS_DIR, ".reflection-pending.json");

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "reflection-first-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(HOOK_LOG, JSON.stringify(entry) + "\n"); } catch (e) {}
}

// Read recent corrections (last 15 minutes)
function getRecentCorrections() {
  try {
    if (!fs.existsSync(CORRECTION_LOG)) return [];
    var content = fs.readFileSync(CORRECTION_LOG, "utf-8").trim();
    if (!content) return [];
    var lines = content.split("\n").slice(-20); // Last 20 entries
    var cutoff = Date.now() - 15 * 60 * 1000;
    var recent = [];
    for (var i = 0; i < lines.length; i++) {
      try {
        var entry = JSON.parse(lines[i]);
        if (entry.ts && new Date(entry.ts).getTime() > cutoff) {
          recent.push(entry);
        }
      } catch (e) {}
    }
    return recent;
  } catch (e) { return []; }
}

// Check if flag exists and is still pending
function getPendingFlag() {
  try {
    if (!fs.existsSync(FLAG_FILE)) return null;
    var data = JSON.parse(fs.readFileSync(FLAG_FILE, "utf-8"));
    if (data.reflected) return null; // Already reflected
    // Expire after 30 minutes
    if (Date.now() - new Date(data.ts).getTime() > 30 * 60 * 1000) {
      try { fs.unlinkSync(FLAG_FILE); } catch (e) {}
      return null;
    }
    return data;
  } catch (e) { return null; }
}

// Write pending flag
function setPendingFlag(correction) {
  try {
    fs.writeFileSync(FLAG_FILE, JSON.stringify({
      ts: new Date().toISOString(),
      correction_preview: (correction.prompt_preview || "").substring(0, 100),
      pattern: correction.pattern || "",
      reflected: false
    }));
  } catch (e) {}
}

// Clear the flag (reflection done)
function clearFlag() {
  try {
    if (fs.existsSync(FLAG_FILE)) {
      var data = JSON.parse(fs.readFileSync(FLAG_FILE, "utf-8"));
      data.reflected = true;
      fs.writeFileSync(FLAG_FILE, JSON.stringify(data));
    }
  } catch (e) {}
}

module.exports = function(input) {
  var tool = (input || {}).tool_name;
  if (!tool) return null;

  // Only gate action tools
  if (tool !== "Edit" && tool !== "Write" && tool !== "Bash") return null;

  var ti = input.tool_input;
  if (typeof ti === "string") { try { ti = JSON.parse(ti); } catch (e) { ti = {}; } }

  // Check for existing pending flag
  var pending = getPendingFlag();

  if (!pending) {
    // No pending flag — check if there are recent corrections
    var corrections = getRecentCorrections();
    if (corrections.length === 0) return null;

    // Set the flag
    setPendingFlag(corrections[corrections.length - 1]);
    pending = getPendingFlag();
    if (!pending) return null;
    log({ action: "flag-set", correction: corrections[corrections.length - 1].prompt_preview });
  }

  // Flag is pending — check if this tool call is the reflection
  var filePath = (ti || {}).file_path || "";
  var norm = filePath.replace(/\\/g, "/");

  // Allow Edit/Write to TODO.md (that's the reflection)
  if (/TODO\.md$/i.test(norm)) {
    // Check if the content contains reflection indicators
    var content = (ti || {}).new_string || (ti || {}).content || "";
    var reflectionPatterns = [
      /root cause/i,
      /lesson/i,
      /pattern/i,
      /prevention/i,
      /what went wrong/i,
      /why.*happened/i,
      /correction/i,
      /mistake/i
    ];
    var hasReflection = false;
    for (var i = 0; i < reflectionPatterns.length; i++) {
      if (reflectionPatterns[i].test(content)) { hasReflection = true; break; }
    }
    if (hasReflection) {
      clearFlag();
      log({ action: "reflection-accepted", file: norm });
      return null;
    }
    // Allow TODO.md edits even without reflection keywords — they're working toward it
    return null;
  }

  // Block action tools until reflection is written
  log({ action: "blocked", tool: tool, file: norm });
  return {
    decision: "block",
    reason: "BLOCKED: Action tool used before reflecting on user correction.\n" +
      "WHY: User corrected you recently: \"" + (pending.correction_preview || "unknown") + "\"\n" +
      "NEXT STEPS:\n" +
      "1. Analyze root cause: what went wrong and why\n" +
      "2. Write reflection to TODO.md (include: root cause, pattern, prevention)\n" +
      "3. Then resume normal work\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix reflection-first-gate — {describe the issue}\""
  };
};
