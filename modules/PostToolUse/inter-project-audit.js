// TOOLS: Edit, Write
// WORKFLOW: shtd, gsd, starter
// WHY: When Project A writes a TODO to Project B, there was no audit trail
// and no way to verify the system was working. This logs every inter-project
// TODO write to a JSONL audit file so the user can track the flow.
// T486: Inter-project TODO priority system.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var AUDIT_DIR = path.join(os.homedir(), ".claude", "audit");
var AUDIT_LOG = path.join(AUDIT_DIR, "inter-project-todo.jsonl");

// Extract project name from a file path under PROJECTS_ROOT
function extractProjectName(filePath) {
  var projectsRoot = (process.env.CLAUDE_PROJECTS_ROOT ||
    (process.env.CLAUDE_PROJECT_DIR ? path.dirname(process.env.CLAUDE_PROJECT_DIR) : "") ||
    "").replace(/\\/g, "/");
  if (!projectsRoot) return null;
  var norm = filePath.replace(/\\/g, "/");
  if (norm.indexOf(projectsRoot) !== 0) return null;
  var rest = norm.slice(projectsRoot.length + 1);
  var slash = rest.indexOf("/");
  return slash > 0 ? rest.slice(0, slash) : rest;
}

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var toolInput;
  try {
    toolInput = typeof input.tool_input === "string"
      ? JSON.parse(input.tool_input) : input.tool_input || {};
  } catch(e) { toolInput = input.tool_input || {}; }

  var filePath = (toolInput.file_path || "").replace(/\\/g, "/");
  if (!filePath || path.basename(filePath) !== "TODO.md") return null;

  // Determine source and target projects
  var sourceProject = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var sourceName = sourceProject ? path.basename(sourceProject) : "unknown";
  var targetName = extractProjectName(filePath);
  if (!targetName) return null;

  // Same project — not an inter-project write
  if (targetName.toLowerCase() === sourceName.toLowerCase()) return null;

  // This is an inter-project TODO write — log it
  var content = toolInput.new_string || toolInput.content || "";

  // Extract task IDs from the content
  var taskIds = [];
  var taskMatch = content.match(/T\d+/g);
  if (taskMatch) {
    var seen = {};
    for (var i = 0; i < taskMatch.length; i++) {
      if (!seen[taskMatch[i]]) { seen[taskMatch[i]] = true; taskIds.push(taskMatch[i]); }
    }
  }

  // Extract unchecked TODO lines for the summary
  var todoLines = [];
  var lines = content.split("\n");
  for (var li = 0; li < lines.length; li++) {
    if (/^- \[ \] /.test(lines[li])) todoLines.push(lines[li].trim());
  }

  var entry = {
    ts: new Date().toISOString(),
    source_project: sourceName,
    target_project: targetName,
    session_id: process.env.CLAUDE_SESSION_ID || "",
    tool: tool,
    task_ids: taskIds,
    todo_lines: todoLines,
    file: filePath,
    status: "pending"
  };

  try {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
    fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n");
  } catch(e) { /* silent — audit should never break workflow */ }

  return null; // PostToolUse — never block
};
