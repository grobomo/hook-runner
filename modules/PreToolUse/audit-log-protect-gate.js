// TOOLS: Bash, Write, Edit
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Log files were deleted or truncated, destroying the audit trail
// needed to debug gate failures and track session behavior.
// T791: Protect JSONL log files from deletion and truncation.
//
// INCIDENT HISTORY:
//   2026-06-01: hook-log.jsonl was overwritten instead of appended,
//   losing 3 days of gate decision history needed for T785 audit.
"use strict";

var PROTECTED_PATTERNS = [
  /\.jsonl$/,                  // all JSONL log files
  /audit\.log$/,               // audit log
  /hook-log\./,                // hook runner logs
  /correction-log\./,          // correction detector log
  /mandate-log\./,             // mandate tracking log
  /watchdog-log\./,            // watchdog log
  /dispatches\./,              // cross-project dispatch log
  /tracking\./,                // request tracking
  /health\./,                  // health check log
];

function isProtectedLog(filePath) {
  if (!filePath) return false;
  var norm = filePath.replace(/\\/g, "/");
  for (var i = 0; i < PROTECTED_PATTERNS.length; i++) {
    if (PROTECTED_PATTERNS[i].test(norm)) return true;
  }
  return false;
}

module.exports = function(input) {
  var tool = input.tool_name;

  // Bash: block rm/del/truncate of log files
  if (tool === "Bash") {
    var cmd = (input.tool_input || {}).command || "";
    if (!cmd) return null;

    // Strip quoted strings
    var stripped = cmd
      .replace(/"(?:[^"\\]|\\.)*"/g, "STR")
      .replace(/'(?:[^'\\]|\\.)*'/g, "STR");

    // Check for destructive operations on log files
    var hasDelete = /\brm\b|\bdel\b|\bunlink\b|\btruncate\b/.test(stripped);
    var hasRedirectOverwrite = />\s*\S*\.jsonl\b/.test(stripped) && !/>>/.test(stripped);

    if (hasDelete || hasRedirectOverwrite) {
      for (var i = 0; i < PROTECTED_PATTERNS.length; i++) {
        if (PROTECTED_PATTERNS[i].test(stripped)) {
          return {
            decision: "block",
            reason: "BLOCKED: Deletion or truncation of audit log file\n" +
              "WHY: Log files are the audit trail — deleting them destroys gate decision history needed for debugging\n" +
              "NEXT STEPS:\n" +
              "1. Use 'node setup.js --prune N' to prune old entries (keeps recent)\n" +
              "2. Archive old logs with mv/cp before removing\n" +
              "3. Never truncate or overwrite — only append\n" +
              "FALSE POSITIVE? File a TODO in hook-runner: \"Fix audit-log-protect-gate — {describe the issue}\""
          };
        }
      }
    }
    return null;
  }

  // Write tool: block overwrite of JSONL files (must use append)
  if (tool === "Write") {
    var filePath = "";
    try {
      filePath = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || "";
    } catch (e) {
      filePath = (input.tool_input || {}).file_path || "";
    }
    if (isProtectedLog(filePath)) {
      return {
        decision: "block",
        reason: "BLOCKED: Write tool overwrites JSONL log file — use appendFileSync instead\n" +
          "WHY: The Write tool replaces file contents entirely. Log files must be append-only to preserve history.\n" +
          "NEXT STEPS:\n" +
          "1. Use fs.appendFileSync() in code instead of the Write tool\n" +
          "2. Or use Bash with >> (append redirect) instead of > (overwrite)\n" +
          "FALSE POSITIVE? File a TODO in hook-runner: \"Fix audit-log-protect-gate — {describe the issue}\""
      };
    }
  }

  return null;
};
