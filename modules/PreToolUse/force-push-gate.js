// TOOLS: Bash
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Force-pushing to main/master can destroy shared history and others' work.
// There is no undo for a force-push that overwrites remote commits.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try { cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || ""; } catch (e) { cmd = (input.tool_input || {}).command || ""; }
  if (!cmd) return null;

  // Detect git push with --force or -f flag
  var norm = cmd.replace(/\s+/g, " ").trim();
  var isGitPush = /\bgit\s+push\b/.test(norm);
  if (!isGitPush) return null;

  var hasForce = /\s--force\b/.test(norm) || /\s-f\b/.test(norm) || /\s--force-with-lease\b/.test(norm);
  if (!hasForce) return null;

  // Check if pushing to main or master
  var protectedBranches = ["main", "master"];
  for (var i = 0; i < protectedBranches.length; i++) {
    var branchPattern = new RegExp("\\b" + protectedBranches[i] + "\\b");
    if (branchPattern.test(norm)) {
      return {
        decision: "block",
        reason: "BLOCKED: Force-push to main or master branch\nWHY: Force-pushes rewrite shared history and destroy teammates' work, causing lost commits and broken collaboration\nNEXT STEPS:\n1. Use `git push` without the force flag to respect shared history\n2. If you need to undo changes, use `git revert` or `git reset` on a feature branch first, then merge normally\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix force-push-gate — {describe the issue}\""
      };
    }
  }

  // Force-push to non-protected branches: warn but allow
  return null;
};
