// WORKFLOW: cross-project-reset
// WHY: When working in project A, Claude drifts into project B's files (cd, edit, read).
// Instead of working in-place, spawn a new tab via context-reset so both projects
// get proper tracking, hooks, and TODO.md context.
"use strict";
var path = require("path");
var os = require("os");

// WHY: PROJECTS_ROOT is configurable so this module works on any machine.
// Set CLAUDE_PROJECTS_ROOT env var to override (e.g. ~/projects, ~/src).
// Falls back to CLAUDE_PROJECT_DIR's parent if available, then skips detection.
var PROJECTS_ROOT = (process.env.CLAUDE_PROJECTS_ROOT ||
  (process.env.CLAUDE_PROJECT_DIR ? path.dirname(process.env.CLAUDE_PROJECT_DIR) : "") ||
  "").replace(/\\/g, "/");
var SKILLS_ROOT = path.join(os.homedir(), ".claude", "skills").replace(/\\/g, "/");

/**
 * Extract a project directory from a file path or command.
 * Returns the project root (e.g. ~/projects/foo) or null.
 */
function extractProjectDir(filePath) {
  if (!filePath) return null;
  var fp = filePath.replace(/\\/g, "/");

  // Match <PROJECTS_ROOT>/<project>/...
  var projMatch = fp.match(new RegExp(PROJECTS_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/([^/]+)"));
  if (projMatch) return PROJECTS_ROOT + "/" + projMatch[1];

  // Match ~/.claude/skills/<skill>/...
  var skillMatch = fp.match(new RegExp(SKILLS_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/([^/]+)"));
  if (skillMatch) return SKILLS_ROOT + "/" + skillMatch[1];

  return null;
}

/**
 * Get the current project directory from environment.
 */
function getCurrentProject() {
  var dir = (process.env.CLAUDE_PROJECT_DIR || process.cwd() || "").replace(/\\/g, "/");
  return extractProjectDir(dir) || dir;
}

module.exports = function(input) {
  var toolName = input.tool_name || "";
  var toolInput = input.tool_input || {};
  var currentProject = getCurrentProject();
  if (!currentProject) return null;

  // Extract target path from the tool call
  var targetPath = null;

  if (toolName === "Bash") {
    var cmd = toolInput.command || "";
    // Detect cd into another project
    var cdMatch = cmd.match(/\bcd\s+["']?([^\s"';&|]+)/);
    if (cdMatch) targetPath = cdMatch[1];
    // Also check for explicit paths in common commands
    if (!targetPath) {
      var pathMatch = cmd.match(new RegExp("(" + PROJECTS_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/[^\\s\"';&|]+)"));
      if (!pathMatch) pathMatch = cmd.match(new RegExp("(" + SKILLS_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/[^\\s\"';&|]+)"));
      if (pathMatch) targetPath = pathMatch[1];
    }
  } else if (toolName === "Read" || toolName === "Write" || toolName === "Edit" || toolName === "Glob" || toolName === "Grep") {
    targetPath = toolInput.file_path || toolInput.path || null;
  }

  if (!targetPath) return null;

  var targetProject = extractProjectDir(targetPath);
  if (!targetProject) return null;

  // Same project — no drift
  if (targetProject === currentProject) return null;

  // Allow reading/writing TODO.md or SESSION_STATE.md to other projects (needed for context-reset handoff)
  if ((toolName === "Write" || toolName === "Edit" || toolName === "Read") && targetPath) {
    var basename = path.basename(targetPath);
    if (basename === "TODO.md" || basename === "SESSION_STATE.md") return null;
  }

  // Allow running context-reset.py (the spawn command itself)
  if (toolName === "Bash") {
    var cmd2 = toolInput.command || "";
    if (cmd2.indexOf("context_reset.py") >= 0 || cmd2.indexOf("context-reset") >= 0) return null;
  }

  // Drift detected — block and instruct to spawn new tab
  var targetName = path.basename(targetProject);
  var currentName = path.basename(currentProject);
  return {
    decision: "block",
    reason: "[cwd-drift] BLOCKED: You're in " + currentName + " but tried to access " + targetName + ".\n" +
      "DO THIS NOW:\n" +
      "1) Write " + targetName + " tasks to " + targetProject + "/TODO.md (use Write tool — that path is allowed once for this)\n" +
      "2) Run: python " + PROJECTS_ROOT + "/context-reset/context_reset.py --project-dir " + targetProject + "\n" +
      "   This spawns a NEW Claude tab that picks up TODO.md and works independently.\n" +
      "3) Continue working on " + currentName + " tasks in THIS session. Do not touch " + targetName + " files again."
  };
};
