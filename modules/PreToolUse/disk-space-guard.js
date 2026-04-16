// WORKFLOW: shtd, starter
// WHY: Claude ran rm -rf on temp files when disk was full without asking.
// Deleting files to free space is dangerous — wrong target = lost work.
// This gate blocks destructive commands when the previous error was disk-related.
"use strict";
var fs = require("fs");
var path = require("path");

// State file: set by PostToolUse when disk error detected
var STATE_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".claude", ".disk-space-alert"
);

// Patterns that indicate disk space issues in error output
var DISK_ERROR_PATTERNS = [
  /out of diskspace/i,
  /no space left on device/i,
  /not enough space/i,
  /disk is full/i,
  /write error.*diskspace/i,
  /ENOSPC/,
];

// Destructive commands that should be blocked during disk emergencies
var DESTRUCTIVE_PATTERNS = [
  /\brm\s+-rf?\b/,
  /\brm\s+.*-[a-z]*f/,
  /\brmdir\b/,
  /\bdel\b.*\/[sS]/,
  /Remove-Item.*-Recurse/i,
  /\bclean\b.*--force/,
  /\bprune\b/,
  /\bpurge\b/,
];

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string"
      ? JSON.parse(input.tool_input)
      : input.tool_input || {}).command || "";
  } catch(e) {
    cmd = (input.tool_input || {}).command || "";
  }
  if (!cmd) return null;

  // Check if we're in disk-space-alert mode
  var inAlert = false;
  try { inAlert = fs.existsSync(STATE_FILE); } catch(e) {}

  if (!inAlert) return null;

  // In alert mode: block destructive commands
  for (var i = 0; i < DESTRUCTIVE_PATTERNS.length; i++) {
    if (DESTRUCTIVE_PATTERNS[i].test(cmd)) {
      return {
        decision: "block",
        reason: "DISK SPACE GUARD: Destructive command blocked during disk space emergency.\n" +
          "WHY: Deleting files to free space risks destroying important data.\n" +
          "Run the disk-monitor scan first to identify safe cleanup candidates:\n" +
          "  python ~/.claude/skills/disk-monitor/scan.py --min-size-mb 100\n" +
          "Present the categorized results and wait for explicit user approval.\n" +
          "See ~/.claude/rules/disk-space-safety.md for the approved process.\n" +
          "Command blocked: " + cmd.substring(0, 100)
      };
    }
  }

  return null;
};

// Export patterns for PostToolUse detector
module.exports.DISK_ERROR_PATTERNS = DISK_ERROR_PATTERNS;
module.exports.STATE_FILE = STATE_FILE;
