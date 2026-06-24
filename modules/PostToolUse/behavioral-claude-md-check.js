// TOOLS: Edit, Write
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Claude habitually adds behavioral enforcement text to CLAUDE.md instead of
// creating mechanical gates. Behavioral rules in CLAUDE.md are suggestions Claude
// can ignore under pressure; gates are mechanical and cannot be bypassed.
//
// T813: Detect behavioral instructions in CLAUDE.md edits.
//
// INCIDENT HISTORY:
//   Multiple sessions: Claude added "always reflect before acting", "review output
//   before declaring done", etc. to CLAUDE.md. These were ignored in the very next
//   session. Same patterns recurred until converted to gates (T808, T820).
"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");
function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "behavioral-claude-md-check";
  entry.event = "PostToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

// Behavioral enforcement patterns — phrases that sound like rules/mandates
var BEHAVIORAL_PATTERNS = [
  /\balways\s+(?:check|verify|review|reflect|confirm|ensure|validate|test|run)\b/i,
  /\bnever\s+(?:skip|ignore|bypass|forget|omit|assume)\b/i,
  /\bmust\s+(?:always|never|first|check|verify|run|create|write|update|read)\b/i,
  /\bbefore\s+(?:any|every|each)\s+(?:edit|change|commit|push|deploy|write)\b/i,
  /\bafter\s+(?:any|every|each)\s+(?:edit|change|commit|push|deploy|write)\b/i,
  /\bdo\s+not\s+(?:ever|proceed|continue|start|begin)\b/i,
  /\brequired\s+before\b/i,
  /\bmandatory\s+(?:step|check|review|verification)\b/i,
];

// Design principle patterns — these are OK in CLAUDE.md
var PRINCIPLE_PATTERNS = [
  /\bportable\b/i,
  /\bcross-platform\b/i,
  /\bmodular\b/i,
  /\bsimple\b/i,
  /\bsecurity\b/i,
  /\barchitecture\b/i,
  /\bdesign\b/i,
  /\bprefer\b/i,
  /\bphilosophy\b/i,
  /\bprinciple\b/i,
  /\bapproach\b/i,
  /\bpattern\b/i,
];

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var filePath = ((input.tool_input || {}).file_path || "").replace(/\\/g, "/");
  if (!filePath || !/CLAUDE\.md$/i.test(filePath)) return null;

  // Get the new content being added
  var newContent = "";
  if (tool === "Edit") {
    newContent = (input.tool_input || {}).new_string || "";
  } else if (tool === "Write") {
    newContent = (input.tool_input || {}).content || "";
  }

  if (!newContent || newContent.length < 20) return null;

  // Check for behavioral patterns in new content
  var behavioralMatches = [];
  for (var i = 0; i < BEHAVIORAL_PATTERNS.length; i++) {
    var match = newContent.match(BEHAVIORAL_PATTERNS[i]);
    if (match) {
      behavioralMatches.push(match[0]);
    }
  }

  if (behavioralMatches.length === 0) return null;

  // Check if it's more of a design principle (high principle-word ratio)
  var principleCount = 0;
  for (var j = 0; j < PRINCIPLE_PATTERNS.length; j++) {
    if (PRINCIPLE_PATTERNS[j].test(newContent)) principleCount++;
  }

  // If more principle words than behavioral, it's probably a design doc — skip
  if (principleCount > behavioralMatches.length) return null;

  _log({
    result: "warn",
    file: path.basename(filePath),
    behavioral: behavioralMatches,
    principleCount: principleCount
  });

  // Non-blocking warning (PostToolUse never blocks per T803)
  return {
    decision: "block",
    reason: "BEHAVIORAL RULE IN CLAUDE.md DETECTED\n" +
      "WHY: Behavioral enforcement in CLAUDE.md is ignored under pressure. Convert to a gate.\n" +
      "Patterns found: " + behavioralMatches.join(", ") + "\n" +
      "NEXT STEPS:\n" +
      "1. File a TODO in hook-runner with a gate spec (event type, trigger, block message)\n" +
      "2. Design principles (how to think) are fine in CLAUDE.md\n" +
      "3. Behavioral rules (what to do/not do) must be gates\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix behavioral-claude-md-check — {describe the issue}\""
  };
};
