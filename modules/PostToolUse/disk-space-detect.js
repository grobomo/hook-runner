// WORKFLOW: shtd, starter
// WHY: Companion to PreToolUse/disk-space-guard.js.
// Detects disk space errors in tool output and sets alert mode.
// Alert mode blocks destructive commands until user resolves the issue.
"use strict";
var fs = require("fs");
var path = require("path");

var STATE_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".claude", ".disk-space-alert"
);

var DISK_ERROR_PATTERNS = [
  /out of diskspace/i,
  /no space left on device/i,
  /not enough space/i,
  /disk is full/i,
  /write error.*diskspace/i,
  /ENOSPC/,
];

module.exports = function(input) {
  var output = "";
  try {
    var parsed = typeof input.tool_input === "string"
      ? JSON.parse(input.tool_input)
      : input.tool_input || {};
    // PostToolUse gets tool_result
    output = (input.tool_result || "") + " " + (parsed.stderr || "") + " " + (parsed.stdout || "");
  } catch(e) {
    output = String(input.tool_result || "");
  }

  for (var i = 0; i < DISK_ERROR_PATTERNS.length; i++) {
    if (DISK_ERROR_PATTERNS[i].test(output)) {
      // Set alert mode
      try {
        fs.writeFileSync(STATE_FILE, new Date().toISOString() + "\n" + output.substring(0, 500));
      } catch(e) { /* can't write — disk is full, ironically */ }

      return {
        decision: "block",
        reason: "DISK SPACE ALERT: The last command failed due to insufficient disk space.\n" +
          "DO NOT attempt to delete files to free space.\n" +
          "Instead: run the disk-monitor scan to identify cleanup candidates:\n" +
          "  python ~/.claude/skills/disk-monitor/scan.py --min-size-mb 100\n" +
          "Present the categorized results to the user and WAIT for explicit approval.\n" +
          "See ~/.claude/rules/disk-space-safety.md for the approved process.\n" +
          "To clear this alert after user resolves it: delete ~/.claude/.disk-space-alert"
      };
    }
  }

  // Clear alert if a command succeeds (user freed space)
  try {
    if (fs.existsSync(STATE_FILE)) {
      // Only clear if the tool succeeded (no error in output)
      var hasError = /error|fail|fatal/i.test(output) && /disk|space|write/i.test(output);
      if (!hasError) {
        fs.unlinkSync(STATE_FILE);
      }
    }
  } catch(e) {}

  return null;
};
