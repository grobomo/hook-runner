// WORKFLOW: shtd
// WHY: Nested `claude -p` calls inside a session don't work reliably.
// Cross-project work must use context_reset.py which opens a proper new terminal session.
// Also blocks TaskCreate since it's a within-session tracker, not a session spawner.
"use strict";

module.exports = function(input) {
  var tool = input.tool_name;

  // Block Bash commands that try to run claude as a subprocess
  if (tool === "Bash") {
    var cmd = (input.tool_input || {}).command || "";

    // Skip if "claude" only appears inside a search pattern (grep, rg, findstr, etc.)
    // FP incident: `grep -E "vpn|monitor|claude"` matched the pipe-into-claude regex
    // because `|claude` inside the quoted grep pattern looked like `| claude`.
    var isSearchPattern = /\b(grep|rg|findstr|awk|sed)\b/.test(cmd) &&
                          /["'].*claude.*["']/.test(cmd);
    if (isSearchPattern) return null;

    // Skip git/gh_auto commands — "claude" appears in paths (e.g. ~/.claude/hooks)
    // and commit messages but these aren't running claude as a subprocess.
    // FP incident: `git commit -m "$(cat <<'EOF'\nT32..."` blocked because
    // the heredoc contained "claude" in a path reference.
    if (/^\s*(git\s|gh_auto\s)/.test(cmd)) return null;

    // Match: claude -p, claude --print, claude -m, or piped into claude
    if (/\bclaude\s+(-p|--print|-m|--message)\b/.test(cmd) ||
        /\|\s*claude\b/.test(cmd) ||
        /\bclaude\s+-/.test(cmd)) {
      return {
        decision: "block",
        reason: "NO NESTED CLAUDE: Cannot run claude as a subprocess — it doesn't work reliably.\n" +
          "FIX: Use context_reset.py to spawn a proper new session:\n" +
          "  python context_reset.py --target-project /path/to/other/project \\\n" +
          "    --no-close --prompt \"your instructions here\"\n" +
          "Or open a new terminal tab and run claude there."
      };
    }
  }

  return null;
};
