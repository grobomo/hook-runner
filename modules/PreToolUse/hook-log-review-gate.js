// TOOLS: Edit, Write
// WORKFLOW: shtd, gsd, starter
// WHY: Claude created hook modules that solved the wrong problem because it
// didn't review actual hook-log.jsonl blocks or conversation logs first.
// T542 was written as "gates block ls/find/cat" but the real incidents were
// powershell OpenRead, python scripts, and wsl commands — only discovered
// by reviewing hook-log.jsonl. This gate enforces evidence-based hook design.
// requires: hook-editing-gate
"use strict";
var fs = require("fs");
var path = require("path");

// Detect if the edit target is a hook module (new or existing)
var MODULE_PATTERNS = [
  /[\/\\]modules[\/\\](PreToolUse|PostToolUse|SessionStart|Stop|UserPromptSubmit)[\/\\]/,
  /[\/\\]run-modules[\/\\](PreToolUse|PostToolUse|SessionStart|Stop|UserPromptSubmit)[\/\\]/,
];

// Flag file: time-based validity (4 hours). No ppid — it changes per invocation.
var FLAG_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "/tmp",
  ".claude", "hooks"
);
var REVIEW_FLAG = path.join(FLAG_DIR, ".hook-log-reviewed");
var FLAG_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function isReviewFresh() {
  try {
    var stat = fs.statSync(REVIEW_FLAG);
    return (Date.now() - stat.mtimeMs) < FLAG_TTL_MS;
  } catch (e) { return false; }
}

// Extract the module name being created/edited from the file path
function extractModuleName(filePath) {
  var norm = filePath.replace(/\\/g, "/");
  var match = norm.match(/[\/]([\w-]+)\.js$/);
  return match ? match[1] : "";
}

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var ti = input.tool_input;
  if (typeof ti === "string") { try { ti = JSON.parse(ti); } catch (e) { return null; } }
  var filePath = (ti || {}).file_path || "";
  if (!filePath) return null;

  // Check if this is a hook module file
  var isModule = false;
  for (var i = 0; i < MODULE_PATTERNS.length; i++) {
    if (MODULE_PATTERNS[i].test(filePath)) { isModule = true; break; }
  }
  if (!isModule) return null;

  // Skip helper files (underscore prefix) — they're not standalone modules
  var basename = path.basename(filePath);
  if (basename.charAt(0) === "_") return null;

  var moduleName = extractModuleName(filePath);
  if (!moduleName) return null;

  // Check if hook-log review was done recently (within 4 hours)
  if (isReviewFresh()) return null;

  return {
    decision: "block",
    reason: "HOOK LOG REVIEW GATE: Review hook-log.jsonl before creating/editing module '" + moduleName + "'.\n" +
      "WHY: Hook modules must be evidence-based. Without reviewing actual blocks and\n" +
      "conversation logs, you risk solving the wrong problem (T542 lesson).\n" +
      "REQUIRED STEPS:\n" +
      "  1. Read ~/.claude/hooks/hook-log.jsonl — grep for related blocks/errors\n" +
      "  2. Identify the ACTUAL commands/scenarios that triggered the issue\n" +
      "  3. Only then create/edit the module with the real evidence\n" +
      "After reviewing, run:\n" +
      "  touch " + REVIEW_FLAG.replace(/\\/g, "/") + "\n" +
      "to confirm review is done (valid for 4 hours)."
  };
};
