// TOOLS: Bash
// WORKFLOW: shtd, gsd, haiku-rules
// WHY: During a rebase, --ours/--theirs are REVERSED from intuition.
// Claude used --theirs thinking it meant "my local changes" but during
// rebase it means the upstream branch. This silently dropped 30+ hook
// modules. Also: credential helper must use double quotes not single.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";

  // Rebase ours/theirs warning
  if (/git\s+(rebase|checkout)\s+.*--(ours|theirs)/.test(cmd)) {
    return {
      decision: "block",
      reason: "BLOCKED: git rebase with --ours or --theirs conflict resolution\nWHY: During rebase, --ours and --theirs are reversed from their normal meaning, causing developers to accidentally accept the wrong version of conflicted code.\nNEXT STEPS:\n1. Use git mergetool or manually resolve conflicts in your editor instead\n2. If you must use flags, remember that during rebase --ours refers to the upstream branch and --theirs refers to your current branch\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix git-rebase-safety — {describe the issue}\""
    };
  }

  // Credential helper quoting
  if (/git\s+config.*credential\.helper\s+'/.test(cmd)) {
    return {
      decision: "block",
      reason: "BLOCKED: Credential helper with single quotes.\nWHY: Git credential.helper with single quotes breaks on Windows — the shell interprets them differently.\nNEXT STEPS:\n1. Use double quotes: git config credential.helper \"!gh auth git-credential\"\n2. Verify with: git config --get credential.helper\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix git-rebase-safety — {describe the issue}\""
    };
  }

  return null;
};
