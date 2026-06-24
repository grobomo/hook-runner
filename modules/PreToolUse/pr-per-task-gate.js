// TOOLS: Bash
// WORKFLOW: shtd, gsd
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
          reason: "BLOCKED: PR submitted without a task ID in the title\nWHY: Batched PRs with multiple tasks prevented effective mobile monitoring and made rollbacks impossible to trace to specific work\nNEXT STEPS:\n1. Add a task ID (e.g. T001) to your PR title\n2. Ensure one task ID per PR to maintain clear deployment tracking\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix pr-per-task-gate — {describe the issue}\""
        };
      }
    }
  }

  return null;
};
