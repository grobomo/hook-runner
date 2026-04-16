// WORKFLOW: shtd, gsd
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
      reason: "REBASE SAFETY: During git rebase, --ours/--theirs are REVERSED:\n" +
        "  --ours  = branch being rebased ONTO (upstream/remote)\n" +
        "  --theirs = YOUR local commits being replayed\n" +
        "During cherry-pick, it's the intuitive direction.\n" +
        "Verify: after rebase, run git diff HEAD~1 --stat to confirm your files are present.\n" +
        "If you're resolving conflicts during rebase, use --theirs to keep YOUR changes."
    };
  }

  // Credential helper quoting
  if (/git\s+config.*credential\.helper\s+'/.test(cmd)) {
    return {
      decision: "block",
      reason: "CREDENTIAL HELPER: Use double quotes, not single quotes.\n" +
        "Single quotes in Git Bash double-escape ! to \\! in .git/config.\n" +
        "Correct: git config credential.helper \"!gh auth git-credential\"\n" +
        "Wrong:   git config credential.helper '!gh auth git-credential'"
    };
  }

  return null;
};
