// TOOLS: Bash, Edit, Write
// WORKFLOW: haiku-rules
// WHY: Haiku spirit-check (PostToolUse) detects violations but can't block.
// This gate reads the state file and blocks Opus on the NEXT tool call,
// forcing it to read the analysis and correct course.
//
// Flow: spirit-check.js writes violation-state.json → this gate reads it → blocks
// After block: sets acknowledged=true → next tool call proceeds.
//
// INCIDENT HISTORY:
//   2026-05-09: Spirit-check detected a creative bypass (python write_text to gate
//   file) but had no way to interrupt Opus. Added violation-gate as the PreToolUse
//   counterpart — blocks once with instructions, then allows after acknowledgement.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var STATE_PATH = path.join(HOME, ".claude", "hooks", "violation-state.json");
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "violation-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

module.exports = function(input) {
  var state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
  } catch (e) {
    return null;
  }

  if (!state.violation || state.acknowledged) {
    return null;
  }

  state.acknowledged = true;
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8"); } catch (e) {}

  log({ result: "block", rule: state.rule, severity: state.severity });

  return {
    decision: "block",
    reason: "BLOCKED: Spirit violation detected [\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix violation-gate — {describe the issue}\"" + state.rule + "] (severity: " + state.severity + ").\nWHY: " + (state.violation_description || "Haiku spirit-check flagged this action as violating gate principles.") + "\nNEXT STEPS:\n1. Read violation-analysis.md for full analysis\n2. Address the violation before continuing"
  };
};
