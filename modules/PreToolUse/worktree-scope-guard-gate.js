// TOOLS: EnterWorktree
// WORKFLOW: haiku-rules
// WHY: Claude autonomously creates worktrees for unrelated work, causing
//      session drift. A worktree named "ad-exchange-spec" in lab-worker is
//      a sign Claude is working on stale backlog from CLAUDE.md instead of
//      the user's actual request.
//
// INCIDENT HISTORY:
//   2026-05-16: Claude created "ad-exchange-spec" worktree in lab-worker to
//   work on stale CLAUDE.md backlog. No TODO item or user request matched.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function _log(obj) {
  obj.ts = new Date().toISOString();
  obj.module = "worktree-scope-guard-gate";
  obj.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n"); } catch (e) {}
}

function getProjectName() {
  var dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.basename(dir).toLowerCase();
}

function readTodoItems() {
  var dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    var content = fs.readFileSync(path.join(dir, "TODO.md"), "utf-8");
    return content.toLowerCase();
  } catch (e) { return ""; }
}

module.exports = function(input) {
  if (input.tool_name !== "EnterWorktree") return null;

  var toolInput = input.tool_input || {};
  var worktreeName = (toolInput.name || "").toLowerCase();

  if (!worktreeName) {
    _log({ result: "pass", reason: "no name specified (auto-generated)" });
    return null;
  }

  var projectName = getProjectName();
  var todoContent = readTodoItems();

  if (worktreeName.indexOf(projectName) !== -1) {
    _log({ result: "pass", reason: "name contains project name" });
    return null;
  }

  var nameWords = worktreeName.replace(/[-_]/g, " ").split(/\s+/);
  for (var i = 0; i < nameWords.length; i++) {
    if (nameWords[i].length >= 3 && todoContent.indexOf(nameWords[i]) !== -1) {
      _log({ result: "pass", reason: "name word '" + nameWords[i] + "' found in TODO" });
      return null;
    }
  }

  if (/^t\d+/.test(worktreeName)) {
    var taskId = worktreeName.match(/^t\d+/)[0];
    if (todoContent.indexOf(taskId) !== -1) {
      _log({ result: "pass", reason: "task ID " + taskId + " found in TODO" });
      return null;
    }
  }

  _log({ result: "block", worktree: worktreeName, project: projectName });
  return {
    decision: "block",
    reason: "BLOCKED: Worktree creation outside of current project scope\nWHY: Autonomous worktree creation for unrelated work led to scattered context and lost task focus across multiple repositories.\nNEXT STEPS:\n1. Specify the exact project or branch you need work on before creating a worktree\n2. Use git worktree list to review existing worktrees and consolidate if needed\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix worktree-scope-guard-gate — {describe the issue}\""
  };
};
