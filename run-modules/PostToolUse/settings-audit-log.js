// Audit log: records all modifications to ~/.claude/ config files.
// Logs to ~/.claude/audit/settings-changes.jsonl with timestamp, file, tool, and diff.
var fs = require("fs");
var path = require("path");

var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
var CLAUDE_DIR = home + "/.claude";
var AUDIT_DIR = CLAUDE_DIR + "/audit";
var AUDIT_LOG = AUDIT_DIR + "/settings-changes.jsonl";

// Paths we care about (under ~/.claude/)
var WATCHED_PATTERNS = [
  "/settings.json",
  "/settings.local.json",
  "/hooks/",
  "/rules/",
  "/skills/",
  "/CLAUDE.md",
  "/.claude/rules/",
];

function isWatchedPath(filePath) {
  var normalized = filePath.replace(/\\/g, "/");
  // Must be under ~/.claude/ or a project .claude/rules/
  for (var i = 0; i < WATCHED_PATTERNS.length; i++) {
    if (normalized.indexOf(WATCHED_PATTERNS[i]) >= 0) return true;
  }
  return false;
}

module.exports = function(input) {
  var toolName = input.tool_name || "";
  var toolInput = input.tool_input || {};
  var toolResult = (input.tool_result || "").substring(0, 500);

  // Only track Write, Edit, Bash (for mv/cp/rm)
  if (toolName !== "Write" && toolName !== "Edit" && toolName !== "Bash") return null;

  var filePath = "";
  var changeType = "";
  var detail = {};

  if (toolName === "Write") {
    filePath = toolInput.file_path || "";
    if (!isWatchedPath(filePath)) return null;
    changeType = "write";
    detail = { content_length: (toolInput.content || "").length };
  } else if (toolName === "Edit") {
    filePath = toolInput.file_path || "";
    if (!isWatchedPath(filePath)) return null;
    changeType = "edit";
    detail = {
      old_string: (toolInput.old_string || "").substring(0, 200),
      new_string: (toolInput.new_string || "").substring(0, 200),
      replace_all: toolInput.replace_all || false,
    };
  } else if (toolName === "Bash") {
    var cmd = toolInput.command || "";
    // Detect mv/cp/rm targeting watched paths
    if (!/\b(mv|cp|rm|cat\s*>|echo.*>)\b/.test(cmd)) return null;
    // Check if any watched path appears in command
    var found = false;
    for (var j = 0; j < WATCHED_PATTERNS.length; j++) {
      if (cmd.indexOf(WATCHED_PATTERNS[j]) >= 0 || cmd.indexOf(".claude") >= 0) {
        found = true;
        break;
      }
    }
    if (!found) return null;
    changeType = "bash";
    filePath = "(bash command)";
    detail = { command: cmd.substring(0, 300) };
  }

  if (!filePath && changeType !== "bash") return null;

  // Write audit entry
  var entry = {
    timestamp: new Date().toISOString(),
    session_id: process.env.CLAUDE_SESSION_ID || "",
    project: (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/").split("/").pop(),
    tool: toolName,
    change_type: changeType,
    file: filePath.replace(/\\/g, "/"),
    detail: detail,
    result_preview: toolResult.substring(0, 200),
  };

  try {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n");
  } catch (e) {
    // Silent fail — audit should never break the workflow
  }

  return null; // Never block, just log
};
