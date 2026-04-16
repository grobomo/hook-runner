// TOOLS: Bash
// WORKFLOW: shtd, starter
// WHY: Claude ran `git reset --hard` and `git checkout .` to "clean up" working
// trees, destroying uncommitted work. These ops are rarely the right solution —
// investigate root cause instead. Only rebase was gated (git-rebase-safety);
// other destructive ops were unguarded.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var fullCmd = (input.tool_input || {}).command || "";

  // T386: Strip heredoc bodies and quoted strings to avoid false positives.
  // Heredocs (<<'EOF'...EOF, <<"EOF"...EOF, <<EOF...EOF) contain prose that
  // mentions git commands but isn't executing them.
  var cmd = fullCmd
    .replace(/<<\s*['"]?(\w+)['"]?[\s\S]*?\n\1(\s|$)/g, " ")  // heredocs
    .replace(/"[^"]*"/g, '""')   // double-quoted strings
    .replace(/'[^']*'/g, "''");  // single-quoted strings

  // git reset --hard — destroys uncommitted changes
  if (/git\s+reset\s+--hard/.test(cmd)) {
    return {
      decision: "block",
      reason: "DESTRUCTIVE: git reset --hard destroys uncommitted changes permanently.\n" +
        "Alternatives:\n" +
        "  git stash        — save changes for later\n" +
        "  git reset --soft — move HEAD but keep changes staged\n" +
        "  git checkout <file> — revert specific files only\n" +
        "If you truly need --hard, ask the user first."
    };
  }

  // T386: git checkout/restore — discards uncommitted changes to files
  // Allow non-destructive forms: checkout -b (new branch), checkout <branch> (switch)
  // Block: checkout . (all files), checkout <file> (single file), restore . / restore <file>
  var checkoutMatch = cmd.match(/git\s+(checkout|restore)\s+(.*)/);
  if (checkoutMatch) {
    var subcmd = checkoutMatch[1];
    var args = checkoutMatch[2].trim();
    // Allow branch operations: checkout -b, checkout --orphan, checkout -
    if (subcmd === "checkout" && /^(-b|--orphan|-t|--track|-)\s/.test(args)) return null;
    // Allow checkout with no args (detached HEAD info) or bare branch name (no dots, no slashes with extensions)
    // Heuristic: if args contain a dot or path separator, it's likely a file path
    if (subcmd === "checkout" && args && !/[.\/\\]/.test(args) && !/^--\s/.test(args)) return null;
    return {
      decision: "block",
      reason: "DESTRUCTIVE: `git " + subcmd + " " + args + "` discards uncommitted changes.\n" +
        "Alternatives:\n" +
        "  git stash                — save changes for later\n" +
        "  git diff <file>          — review changes first\n" +
        "If you truly need to discard changes, ask the user first."
    };
  }

  // git clean -f/-fd — deletes untracked files
  if (/git\s+clean\s+-[a-z]*f/.test(cmd)) {
    return {
      decision: "block",
      reason: "DESTRUCTIVE: git clean -f permanently deletes untracked files.\n" +
        "Run git clean -n first to preview what would be deleted.\n" +
        "If you truly need to clean, ask the user first."
    };
  }

  // git branch -D — force-deletes a branch (may have unmerged commits)
  if (/git\s+branch\s+-D\s/.test(cmd)) {
    return {
      decision: "block",
      reason: "DESTRUCTIVE: git branch -D force-deletes even unmerged branches.\n" +
        "Use git branch -d (lowercase) which refuses if commits are unmerged.\n" +
        "If you truly need -D, ask the user first."
    };
  }

  return null;
};
