// TOOLS: *
// WORKFLOW: shtd, starter, gsd, haiku-rules
// WHY: Gate block messages include "FALSE POSITIVE? File a TODO in hook-runner" but
// Claude often ignores this instruction and moves on. The false positive never gets
// fixed, and the same bad block repeats in future sessions. This module tracks whether
// Claude follows through on false positive instructions within 3 tool calls.
//
// T818: Track false positive follow-through.
// INCIDENT: Multiple sessions where Claude hit gate blocks with FALSE POSITIVE
// instructions, dismissed them, and moved on. The gates were never fixed.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var LOG_PATH = path.join(HOOKS_DIR, "hook-log.jsonl");
var STATE_FILE = path.join(os.tmpdir(), ".false-positive-pending-" +
  (process.env.CLAUDE_SESSION_ID || "").substring(0, 8) + ".json");

// How many tool calls to wait before warning
var FOLLOWUP_WINDOW = 3;
// Don't re-warn for the same block within this many minutes
var COOLDOWN_MINUTES = 30;

function _log(action, detail) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify({
      ts: new Date().toISOString(),
      module: "false-positive-followup-gate",
      action: action,
      detail: (detail || "").substring(0, 300)
    }) + "\n");
  } catch (e) { /* best effort */ }
}

// Read state file
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (e) {
    return { pending: [], warned: {} };
  }
}

// Write state file
function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (e) { /* best effort */ }
}

// Scan recent hook-log for PreToolUse blocks containing "FALSE POSITIVE"
function findRecentFalsePositiveBlocks(maxEntries) {
  var blocks = [];
  try {
    var data = fs.readFileSync(LOG_PATH, "utf-8");
    var lines = data.trim().split("\n");
    var start = Math.max(0, lines.length - (maxEntries || 200));
    for (var i = start; i < lines.length; i++) {
      try {
        var entry = JSON.parse(lines[i]);
        if (entry.event === "PreToolUse" &&
            entry.result === "block" &&
            entry.reason &&
            /FALSE POSITIVE/i.test(entry.reason)) {
          blocks.push({
            ts: entry.ts,
            module: entry.module,
            reason: entry.reason,
            tool: entry.tool || "",
            lineIndex: i
          });
        }
      } catch (e) { /* skip malformed lines */ }
    }
  } catch (e) { /* log file not found */ }
  return blocks;
}

// Check if Claude has written to hook-runner TODO.md recently
function hasFiledTodoRecently(block) {
  try {
    var data = fs.readFileSync(LOG_PATH, "utf-8");
    var lines = data.trim().split("\n");
    var blockTime = new Date(block.ts).getTime();

    for (var i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
      try {
        var entry = JSON.parse(lines[i]);
        var entryTime = new Date(entry.ts).getTime();
        // Only look at entries after the block
        if (entryTime <= blockTime) continue;

        // Check for Edit/Write to hook-runner TODO.md
        if ((entry.event === "PreToolUse" || entry.event === "PostToolUse") &&
            entry.file &&
            /TODO\.md$/i.test(entry.file) &&
            entry.project === "hook-runner") {
          return true;
        }

        // Also check command for Edit/Write tool targeting hook-runner/TODO.md
        if (entry.tool === "Edit" || entry.tool === "Write") {
          if (entry.file && /hook-runner.*TODO\.md/i.test(entry.file)) {
            return true;
          }
        }
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* log not available */ }
  return false;
}

module.exports = function(input) {
  var state = readState();
  var now = Date.now();

  // Step 1: Scan for new FALSE POSITIVE blocks not yet tracked
  var recentBlocks = findRecentFalsePositiveBlocks(200);
  var fiveMinAgo = now - 5 * 60 * 1000;

  for (var i = 0; i < recentBlocks.length; i++) {
    var block = recentBlocks[i];
    var blockTime = new Date(block.ts).getTime();
    // Only track blocks from the last 5 minutes
    if (blockTime < fiveMinAgo) continue;

    // Already tracking this block?
    var alreadyTracked = false;
    for (var j = 0; j < state.pending.length; j++) {
      if (state.pending[j].ts === block.ts && state.pending[j].module === block.module) {
        alreadyTracked = true;
        break;
      }
    }
    if (!alreadyTracked) {
      state.pending.push({
        ts: block.ts,
        module: block.module,
        reason: (block.reason || "").substring(0, 200),
        toolCalls: 0
      });
    }
  }

  // Step 2: Increment tool call counter for all pending blocks
  for (var k = 0; k < state.pending.length; k++) {
    state.pending[k].toolCalls++;
  }

  // Step 3: Check which pending blocks need warnings
  var warnings = [];
  var remaining = [];

  for (var m = 0; m < state.pending.length; m++) {
    var pending = state.pending[m];
    var pendingTime = new Date(pending.ts).getTime();

    // Expire entries older than 30 minutes
    if (now - pendingTime > COOLDOWN_MINUTES * 60 * 1000) {
      continue; // drop it
    }

    // Check if Claude already filed a TODO
    if (hasFiledTodoRecently(pending)) {
      _log("resolved", "Filed TODO for " + pending.module);
      continue; // resolved, drop it
    }

    // Already warned for this specific block?
    var warnKey = pending.module + ":" + pending.ts;
    if (state.warned[warnKey]) {
      remaining.push(pending); // keep tracking but don't warn again
      continue;
    }

    // Window exceeded — time to warn
    if (pending.toolCalls >= FOLLOWUP_WINDOW) {
      warnings.push(pending);
      state.warned[warnKey] = now;
      _log("warn", pending.module + " — " + pending.toolCalls + " tool calls without filing TODO");
    } else {
      remaining.push(pending);
    }
  }

  // Clean up old warned entries (older than cooldown)
  var cleanWarned = {};
  var warnedKeys = Object.keys(state.warned);
  for (var n = 0; n < warnedKeys.length; n++) {
    if (now - state.warned[warnedKeys[n]] < COOLDOWN_MINUTES * 60 * 1000) {
      cleanWarned[warnedKeys[n]] = state.warned[warnedKeys[n]];
    }
  }
  state.warned = cleanWarned;
  state.pending = remaining;
  writeState(state);

  // Step 4: Emit warnings
  if (warnings.length > 0) {
    var msg = "WARNING: You ignored " + warnings.length + " FALSE POSITIVE instruction(s).\n";
    for (var w = 0; w < warnings.length; w++) {
      msg += "  - " + warnings[w].module + " blocked " + warnings[w].toolCalls +
        " tool calls ago. File a TODO in hook-runner/TODO.md with the fix.\n";
    }
    msg += "Gate maintenance is higher priority than feature work.";

    return { decision: "block", reason: msg };
  }

  return null;
};
