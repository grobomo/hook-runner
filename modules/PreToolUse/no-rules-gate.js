// TOOLS: Edit, Write
// WORKFLOW: shtd, starter
// WHY: User has instructed at least 3 times across sessions to never use
// ~/.claude/rules/ or .claude/rules/ — only hook-runner modules and workflows.
// Rules are invisible, unenforceable, and duplicate what hooks already do.
// This gate ensures the instruction sticks permanently.
"use strict";
var path = require("path");
var os = require("os");

var RULES_PATTERNS = [
  // Global rules
  path.join(os.homedir(), ".claude", "rules"),
  // Project rules (normalized)
  ".claude/rules",
  ".claude\\rules"
];

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Edit") return null;

  var filePath = "";
  if (input.tool_input) {
    filePath = input.tool_input.file_path || input.tool_input.path || "";
  }
  if (!filePath) return null;

  // Normalize to forward slashes for comparison
  var normalized = filePath.replace(/\\/g, "/");
  var homeDir = os.homedir().replace(/\\/g, "/");

  // Check global rules dir
  var globalRules = homeDir + "/.claude/rules";
  if (normalized.indexOf(globalRules) === 0) {
    return {
      decision: "block",
      reason: "BLOCKED: Do not use ~/.claude/rules/. All enforcement must be done via hook-runner modules and workflows. " +
        "Create a PreToolUse module in modules/PreToolUse/ instead. " +
        "File: " + filePath
    };
  }

  // Check project rules dir (relative path patterns)
  for (var i = 0; i < RULES_PATTERNS.length; i++) {
    var pattern = RULES_PATTERNS[i].replace(/\\/g, "/");
    if (normalized.indexOf(pattern) !== -1 && normalized.indexOf("/rules/") !== -1) {
      // Make sure it's actually a .claude/rules path, not just any path containing "rules"
      if (normalized.indexOf(".claude/rules") !== -1) {
        return {
          decision: "block",
          reason: "BLOCKED: Do not use .claude/rules/. All enforcement must be done via hook-runner modules and workflows. " +
            "Create a PreToolUse module in modules/PreToolUse/ instead. " +
            "File: " + filePath
        };
      }
    }
  }

  return null;
};
