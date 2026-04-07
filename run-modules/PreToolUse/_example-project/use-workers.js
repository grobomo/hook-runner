// WORKFLOW: dispatcher-worker
// WHY: Example showing how project-scoped modules delegate work to remote workers.
// Example project-scoped module: delegate implementation to remote workers.
// Only runs when CLAUDE_PROJECT_DIR basename matches the folder name.
// Blocks Edit/Write to implementation files — only specs/plans/infra allowed locally.
// Rename this folder to match your project's directory name.
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Edit") return null;

  var targetFile = (input.tool_input || {}).file_path || "";
  if (!targetFile) return null;
  var normalTarget = targetFile.replace(/\\/g, "/");

  // Always allow: specs, plans, rules, hooks, config, docs
  var allowPatterns = [
    /TODO\.md$/, /SESSION_STATE\.md$/, /CLAUDE\.md$/,
    /\.claude\//, /\/specs\//, /\.planning\//, /\.specify\//,
    /\.github\//, /\/hooks\//, /\/rules\//,
    /scripts\/test\//, /scripts\//,
    /\.gitignore$/, /\.json$/,
  ];
  for (var i = 0; i < allowPatterns.length; i++) {
    if (allowPatterns[i].test(normalTarget)) return null;
  }

  // Check if tasks.md exists — if so, implementation should go to workers
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return null;

  var specsDir = path.join(projectDir, "specs");
  if (!fs.existsSync(specsDir)) return null;

  var hasTasksMd = false;
  try {
    var specDirs = fs.readdirSync(specsDir);
    for (var j = 0; j < specDirs.length; j++) {
      if (fs.existsSync(path.join(specsDir, specDirs[j], "tasks.md"))) {
        hasTasksMd = true;
        break;
      }
    }
  } catch (e) { /* skip */ }

  if (!hasTasksMd) return null;

  return {
    decision: "block",
    reason: "USE WORKERS: tasks.md exists — implementation goes to remote workers, not local.\n" +
      "WHY: Workers create PRs visible on GitHub. Local edits bypass the PR trail.\n" +
      "FIX: Submit via your dispatch system. Local handles: specs, plans, tasks, rules, hooks.\n" +
      "Blocked: " + path.basename(targetFile)
  };
};
