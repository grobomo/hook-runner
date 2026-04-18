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

  // Allow settings files (settings.json, settings.local.json)
  if (/settings(\.local)?\.json$/.test(normalized)) return null;

  return {
    decision: "block",
    reason: "HOOK-RUNNER SYSTEM REMINDER — Read before proceeding.\n\n" +
      "The ONLY enforcement mechanism is hook-runner modules:\n" +
      "  Modules:  ~/.claude/hooks/run-modules/<Event>/<name>.js\n" +
      "  Per-project: run-modules/PreToolUse/<project-name>/<name>.js\n" +
      "  Config:   ~/.claude/hooks/modules.yaml\n" +
      "  Source:   " + (process.env.CLAUDE_PROJECT_DIR || "hook-runner project") + "\n\n" +
      "NEVER CREATE:\n" +
      "  ~/.claude/rules/     — not a thing, not enforced, not read\n" +
      "  .claude/rules/       — same, doesn't work, stop trying\n\n" +
      "To add enforcement → create .js in hook-runner/run-modules/PreToolUse/\n" +
      "To edit hooks → open a session in the hook-runner project\n\n" +
      "Blocked: " + filePath.substring(0, 120)
  };
};
