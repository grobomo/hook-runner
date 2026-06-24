// TOOLS: Edit, Write
// WORKFLOW: shtd, gsd
// WHY: Claude repeatedly tries to create .claude/rules/ files despite being
// told dozens of times across dozens of sessions. This hook fires when Claude
// tries to WRITE or EDIT anything in ~/.claude/ to remind it how the system works.
// It's a soft block — Claude can proceed after reading the reminder.
"use strict";
var os = require("os");

var HOOKS_DIR = os.homedir().replace(/\\/g, "/") + "/.claude";

module.exports = function(input) {
  var tool = input.tool_name;
  // Only care about writes/edits, not reads
  if (tool !== "Write" && tool !== "Edit") return null;

  var filePath = (input.tool_input || {}).file_path || "";
  var normalized = filePath.replace(/\\/g, "/");

  // Only fire when touching ~/.claude/ directory
  if (normalized.indexOf(HOOKS_DIR) === -1) return null;

  // Allow edits to hook-runner source (that's where modules live)
  if (normalized.indexOf("hook-runner/") !== -1) return null;

  // Allow edits from hook-runner project (modules.yaml, config files)
  var projDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (projDir.indexOf("/hook-runner") !== -1) return null;

  // Allow settings files (settings.json, settings.local.json)
  if (/settings(\.local)?\.json$/.test(normalized)) return null;

  // Allow data files (JSONL logs/lessons — not code, not enforcement)
  if (/\.jsonl$/.test(normalized)) return null;

  // Allow YAML config files (modules.yaml)
  if (/\.ya?ml$/.test(normalized)) return null;

  return {
    decision: "block",
    reason: "BLOCKED: Automatic creation of .claude/rules/ files\nWHY: Native rules files are the weakest enforcement tier — they don't survive context resets and Claude can rationalize past them.\nNEXT STEPS:\n1. Create a hook-runner gate module instead (modules/PreToolUse/)\n2. All behavioral enforcement must use mechanical gates, not text rules\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix hook-system-reminder — {describe the issue}\""
  };
};
