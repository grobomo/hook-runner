// TOOLS: Bash
// WORKFLOW: shtd, starter, haiku-rules
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
    // FP incident 1: `git commit -m "$(cat <<'EOF'\nT32..."` blocked because
    // the heredoc contained "claude" in a path reference.
    // FP incident 2: `cd /project && git commit -m "..."` blocked because the
    // `cd` prefix meant the `^\s*git` anchor missed the git command.
    // WHY: Use \b word boundary instead of ^ anchor to handle chained commands.
    if (/\b(git\s+(commit|push|pull|fetch|log|diff|status|add|tag|branch|merge|rebase|stash|show|remote|config|checkout))\b/.test(cmd)) return null;
    if (/\bgh_auto\s/.test(cmd)) return null;

    // Info commands (--help, --version): always block, nothing useful as subprocess
    if (/\bclaude\s+(--help|-h|--version|-v)\b/.test(cmd)) {
      return {
        decision: "block",
        reason: "BLOCKED: Nested claude subprocess calls within an active session\nWHY: Claude processes launched as subprocesses during a session do not execute reliably and can cause the session to hang or fail\nNEXT STEPS:\n1. Run claude commands directly in your terminal instead of nesting them within another session\n2. If you need multiple claude invocations, execute them sequentially in separate terminal sessions\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-nested-claude — {describe the issue}\""
      };
    }

    // Script commands (claude -p, --print, -m, piped into claude): suggest alternatives
    if (/\bclaude\s+(-p|--print|-m|--message)\b/.test(cmd) ||
        /\|\s*claude\b/.test(cmd) ||
        /\bclaude\s+-/.test(cmd)) {
      return {
        decision: "block",
        reason: "BLOCKED: Nested claude subprocess invocation within an active session\nWHY: Nested claude -p calls do not execute reliably and can cause session instability or command failures\nNEXT STEPS:\n1. Run claude commands sequentially in separate sessions instead of nesting them\n2. Use shell scripting or task automation outside of the claude session if parallel execution is needed\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-nested-claude — {describe the issue}\""
      };
    }
  }

  return null;
};
