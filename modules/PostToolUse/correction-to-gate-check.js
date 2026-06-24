// TOOLS: Edit, Write
// WORKFLOW: shtd, starter, gsd, haiku-rules
// WHY: User corrections reveal behavioral problems that will repeat next session unless
// converted to mechanical gates. Claude habitually writes prose TODOs ("fix X behavior")
// that get forgotten. This module warns when a correction is detected but Claude doesn't
// produce a gate spec (event type, trigger, block message) in the follow-up.
//
// T820: Corrections must produce gate specs, not just prose TODOs.
// INCIDENT: Multiple sessions where user corrections led to CLAUDE.md text entries
// instead of hook-runner gates. The behavior repeated every session because text
// rules don't survive context resets.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var CORRECTION_LOG = path.join(HOOKS_DIR, "correction-log.jsonl");
var HOOK_LOG = path.join(HOOKS_DIR, "hook-log.jsonl");
var STATE_FILE = path.join(os.tmpdir(), ".correction-gate-check-" +
  (process.env.CLAUDE_SESSION_ID || "").substring(0, 8) + ".json");

// Gate spec indicators — words that suggest a proper gate spec, not just prose
var GATE_SPEC_PATTERNS = [
  /\b(?:PreToolUse|PostToolUse|Stop|SessionStart)\b/,
  /\b(?:BLOCKED|block message|block when|trigger|trigger condition)\b/i,
  /\b(?:module\.exports|function\s*\(input\))\b/,
  /\b(?:event type|gate spec|decision:\s*"block")\b/i,
  /(?:FALSE POSITIVE\??|NEXT STEPS:?)\b/i
];

// Minimum number of gate spec indicators to consider it a proper spec
var MIN_INDICATORS = 2;

function _log(action, detail) {
  try {
    fs.appendFileSync(HOOK_LOG, JSON.stringify({
      ts: new Date().toISOString(),
      module: "correction-to-gate-check",
      action: action,
      detail: (detail || "").substring(0, 300)
    }) + "\n");
  } catch (e) { /* best effort */ }
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); }
  catch (e) { return { lastCheckTs: null, pendingCorrections: [], warned: {} }; }
}

function writeState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); }
  catch (e) { /* best effort */ }
}

// Read recent corrections from correction-log.jsonl
function getRecentCorrections(sinceTs) {
  var corrections = [];
  try {
    var data = fs.readFileSync(CORRECTION_LOG, "utf-8");
    var lines = data.trim().split("\n");
    var cutoff = sinceTs ? new Date(sinceTs).getTime() : Date.now() - 15 * 60 * 1000;
    for (var i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
      try {
        var entry = JSON.parse(lines[i]);
        if (new Date(entry.ts).getTime() > cutoff) {
          corrections.push(entry);
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* no corrections */ }
  return corrections;
}

// Check if a TODO.md edit contains gate spec indicators
function hasGateSpec(editContent) {
  if (!editContent) return false;
  var count = 0;
  for (var i = 0; i < GATE_SPEC_PATTERNS.length; i++) {
    if (GATE_SPEC_PATTERNS[i].test(editContent)) count++;
  }
  return count >= MIN_INDICATORS;
}

module.exports = function(input) {
  // Only check on Edit/Write to TODO.md files
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return null;

  var filePath = (input.tool_input || {}).file_path || "";
  filePath = filePath.replace(/\\/g, "/");

  // Only interested in TODO.md edits
  if (!/TODO\.md$/i.test(filePath)) return null;

  var state = readState();
  var now = Date.now();

  // Check for recent corrections (last 15 minutes)
  var corrections = getRecentCorrections(state.lastCheckTs);
  state.lastCheckTs = new Date().toISOString();

  // If no recent corrections, nothing to enforce
  if (corrections.length === 0) {
    writeState(state);
    return null;
  }

  // Check if the TODO.md edit includes a gate spec
  var editContent = "";
  if (input.tool_input) {
    editContent = (input.tool_input.new_string || input.tool_input.content || "").toString();
  }

  if (hasGateSpec(editContent)) {
    // Claude is writing a proper gate spec — good!
    _log("gate-spec-found", "TODO edit contains gate spec indicators after correction");
    // Clear pending corrections for this session
    state.pendingCorrections = [];
    writeState(state);
    return null;
  }

  // Claude is editing TODO.md after a correction but WITHOUT gate spec indicators
  // Check if we already warned for this correction batch
  var correctionKey = corrections.map(function(c) { return c.ts; }).sort().join(",");
  if (state.warned[correctionKey]) {
    writeState(state);
    return null;
  }

  // Track this correction batch
  state.pendingCorrections = corrections;
  state.warned[correctionKey] = now;

  // Clean old warned entries (older than 1 hour)
  var cleanWarned = {};
  var keys = Object.keys(state.warned);
  for (var k = 0; k < keys.length; k++) {
    if (now - state.warned[keys[k]] < 60 * 60 * 1000) {
      cleanWarned[keys[k]] = state.warned[keys[k]];
    }
  }
  state.warned = cleanWarned;
  writeState(state);

  _log("warn", corrections.length + " correction(s) without gate spec in TODO edit");

  return {
    decision: "block",
    reason: "WARNING: User correction detected but your TODO entry lacks a gate spec.\n" +
      "Correction(s): " + corrections.map(function(c) {
        return (c.prompt_preview || "").substring(0, 60);
      }).join("; ") + "\n" +
      "A proper gate spec includes: event type (PreToolUse/PostToolUse/Stop), " +
      "trigger condition, and block message.\n" +
      "Prose TODOs get forgotten. Gates survive context resets.\n" +
      "Add gate spec indicators to your TODO entry, or file a separate TODO " +
      "in hook-runner/TODO.md with the gate spec."
  };
};
