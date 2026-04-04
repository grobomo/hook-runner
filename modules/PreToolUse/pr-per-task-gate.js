// WHY: Batched PRs with multiple tasks made mobile monitoring and rollbacks impossible.
"use strict";
// PR-per-task gate: blocks `gh pr create` if PR title doesn't include a task ID.
// Enforces: every PR maps to a speckit task (T001, T002, etc.).
// User monitors progress via GitHub Mobile — task IDs in titles are mandatory.

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";

  // Gate: gh pr create must have task ID in title
  if (/gh\s+pr\s+create/.test(cmd)) {
    var titleMatch = cmd.match(/--title\s+["']([^"']+)["']/);
    if (titleMatch) {
      var title = titleMatch[1];
      if (!/T\d{3}/.test(title)) {
        return {
          decision: "block",
          reason: "PR title must include a task ID (e.g. T001). " +
                  "Use speckit to generate tasks first: /speckit.tasks"
        };
      }
    }
  }

  return null;
};
