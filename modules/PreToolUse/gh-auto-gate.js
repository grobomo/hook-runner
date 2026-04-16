// WORKFLOW: shtd, starter
// WHY: `gh auth switch` is broken with EMU accounts — the API still uses the EMU token
// even after switching. Raw `gh` and `git push` commands silently use the wrong account,
// causing 403s or pushing to the wrong org. gh_auto reads .github/publish.json and sets
// GH_TOKEN correctly every time. Tagged security (never disable) instead of shtd.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input && input.tool_input.command) || "";

  // Only check commands that interact with GitHub
  var isGhCmd = /^\s*gh\s/.test(cmd);
  var isGitPush = /\bgit\s+push\b/.test(cmd);
  var isGitFetch = /\bgit\s+fetch\b/.test(cmd);
  var isGitPull = /\bgit\s+pull\b/.test(cmd);
  var isGitLsRemote = /\bgit\s+ls-remote\b/.test(cmd);

  if (!isGhCmd && !isGitPush && !isGitFetch && !isGitPull && !isGitLsRemote) return null;

  // Allow if GH_TOKEN is explicitly set in the command
  if (/GH_TOKEN=/.test(cmd)) return null;

  // Allow if using gh_auto script
  if (/gh_auto/.test(cmd)) return null;

  // Allow gh auth commands (needed to get tokens)
  if (/^\s*gh\s+auth\b/.test(cmd)) return null;

  // Allow gh api user (diagnostic)
  if (/^\s*gh\s+api\s+user\b/.test(cmd)) return null;

  // Block everything else
  var suggestion = isGhCmd
    ? cmd.replace(/^\s*gh\s+/, "gh_auto ")
    : cmd.replace(/\bgit\s+(push|pull|fetch|ls-remote)\b/, "gh_auto $1");

  return {
    decision: "block",
    reason: "[gh-auto-gate] Raw gh/git remote commands use the wrong account with EMU.\n" +
      "Use gh_auto (reads .github/publish.json) or set GH_TOKEN explicitly.\n\n" +
      "Suggested fix:\n  " + suggestion
  };
};
