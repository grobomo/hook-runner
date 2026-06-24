// TOOLS: Edit, Write
// WORKFLOW: haiku-rules
// WHY: Request-tracker dispatcher session edited files in other projects directly instead
// of writing TODOs and dispatching work. This caused merge conflicts and bypassed
// the project-specific sessions that understand each codebase.
// T841: Mechanical gate — block cross-project file edits from dispatcher.
//
// INCIDENT HISTORY:
//   2026-06-04: Dispatcher edited llm-token-tracker dashboard HTML directly,
//   conflicting with the active llm-token-tracker session's changes.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "dispatcher-scope-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

// Only fires when cwd matches request-tracker
function isDispatcherProject() {
  var cwd = process.cwd().replace(/\\/g, "/").toLowerCase();
  return cwd.indexOf("request-tracker") >= 0;
}

// Allowed cross-project file patterns
var ALLOWED_CROSS_PROJECT = [
  /TODO\.md$/i,                    // dispatching work
  /[/\\]\.coconut[/\\]/,           // status reporting
  /[/\\]\.claude[/\\]plans[/\\]/,  // plan mode files
  /SESSION_STATE\.md$/i,           // session handoff
];

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return null;
  if (!isDispatcherProject()) return null;

  var filePath = (input.tool_input || {}).file_path || "";
  if (!filePath) return null;

  // Normalize path for comparison
  var normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();

  // Check if the file is inside request-tracker project
  if (normalizedPath.indexOf("request-tracker") >= 0) {
    _log({ result: "pass", reason: "own_project", file: filePath.slice(-80) });
    return null;
  }

  // Check allowed cross-project patterns
  for (var i = 0; i < ALLOWED_CROSS_PROJECT.length; i++) {
    if (ALLOWED_CROSS_PROJECT[i].test(filePath)) {
      _log({ result: "pass", reason: "allowed_cross_project", pattern: ALLOWED_CROSS_PROJECT[i].toString(), file: filePath.slice(-80) });
      return null;
    }
  }

  // Block cross-project edit
  _log({ result: "block", reason: "cross_project_edit", file: filePath.slice(-80) });
  return {
    decision: "block",
    reason: "BLOCKED: Cross-project file edit from dispatcher session\n" +
      "WHY: Request-tracker manages work, it doesn't edit other projects' code. Direct edits bypass project-specific sessions and cause conflicts.\n" +
      "NEXT STEPS:\n" +
      "1. Write a TODO in the target project's TODO.md instead (this IS allowed)\n" +
      "2. Spawn a session in that project if one isn't running\n" +
      "3. Let the worker session make the code changes\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix dispatcher-scope-gate — {describe the issue}\""
  };
};
