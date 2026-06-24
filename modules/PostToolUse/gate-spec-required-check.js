// TOOLS: Edit, Write
// WORKFLOW: starter
// WHY: Claude habitually writes prose TODOs about behavioral changes ("always do X",
// "never do Y") without specifying a gate implementation. These prose rules get
// forgotten next session. This module warns when a TODO edit looks behavioral but
// lacks gate spec indicators (event type, trigger, block message).
//
// T817: Gate: "needs to change" → gate spec required.
// INCIDENT: Multiple sessions where behavioral changes were documented as CLAUDE.md
// text or prose TODOs. None survived context resets. Only mechanical gates persist.
"use strict";
var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOK_LOG = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

// Behavioral patterns — phrases that suggest enforcement intent
var BEHAVIORAL_PATTERNS = [
  /\b(?:always|never|must|enforce|prevent|forbid)\b/i,
  /\b(?:block when|block if|should not|do not allow|disallow)\b/i,
  /\b(?:stop doing|stop (?:claude|it) from)\b/i,
  /\b(?:behavioral|enforcement|rule:|gate:)\b/i,
  /\b(?:check when|detect when|warn when|catch when)\b/i,
  /\b(?:before every|after each|on every|each time)\b/i,
  /\b(?:mandatory|required before|required after)\b/i
];

// Gate spec indicators — words that suggest a proper gate spec
var GATE_SPEC_INDICATORS = [
  /\b(?:PreToolUse|PostToolUse|Stop|SessionStart)\b/,
  /\b(?:BLOCKED|block message|trigger condition)\b/i,
  /\b(?:module\.exports|function\s*\(input\))\b/,
  /\b(?:event type|gate spec|decision:\s*"block")\b/i,
  /(?:FALSE POSITIVE\??|NEXT STEPS:?)\b/i,
  /\b(?:\.js\b.*module|hook-runner.*module)\b/i
];

var MIN_BEHAVIORAL_PATTERNS = 2;
var MIN_GATE_SPEC_INDICATORS = 2;

function _log(action, detail) {
  try {
    fs.appendFileSync(HOOK_LOG, JSON.stringify({
      ts: new Date().toISOString(),
      module: "gate-spec-required-check",
      action: action,
      detail: (detail || "").substring(0, 300)
    }) + "\n");
  } catch (e) {}
}

function countMatches(text, patterns) {
  var count = 0;
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(text)) count++;
  }
  return count;
}

module.exports = function(input) {
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return null;

  var filePath = (input.tool_input || {}).file_path || "";
  if (!/TODO\.md$/i.test(filePath.replace(/\\/g, "/"))) return null;

  // Get the content being written
  var content = "";
  if (input.tool_input) {
    content = (input.tool_input.new_string || input.tool_input.content || "").toString();
  }
  if (!content || content.length < 20) return null;

  // Check if content has behavioral patterns
  var behavioralCount = countMatches(content, BEHAVIORAL_PATTERNS);
  if (behavioralCount < MIN_BEHAVIORAL_PATTERNS) return null;

  // Content looks behavioral — check for gate spec indicators
  var gateSpecCount = countMatches(content, GATE_SPEC_INDICATORS);
  if (gateSpecCount >= MIN_GATE_SPEC_INDICATORS) {
    _log("pass", "behavioral TODO has gate spec (" + gateSpecCount + " indicators)");
    return null;
  }

  // Behavioral TODO without gate spec — warn
  _log("warn", "behavioral TODO lacks gate spec (" + behavioralCount + " behavioral, " + gateSpecCount + " spec indicators)");

  return {
    decision: "block",
    reason: "WARNING: This TODO describes behavioral enforcement but lacks a gate spec.\n" +
      "Prose rules get forgotten. Gates survive context resets.\n" +
      "A proper gate spec includes:\n" +
      "  - Event type: PreToolUse (block) / PostToolUse (warn) / Stop (review)\n" +
      "  - Trigger condition: what tool/pattern activates it\n" +
      "  - Block message: what the user sees (WHY + NEXT STEPS + FALSE POSITIVE)\n" +
      "Consider adding gate spec indicators to your TODO, or file a separate TODO\n" +
      "in hook-runner/TODO.md with: event type, trigger, and block message template."
  };
};
