// WORKFLOW: shtd
// WHY: Claude ran `git reset --hard` and `git checkout .` to "clean up" working
// trees, destroying uncommitted work. These ops are rarely the right solution —
// investigate root cause instead. Only rebase was gated (git-rebase-safety);
// other destructive ops were unguarded.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";

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

  // git checkout . or git restore . — discards all unstaged changes
  if (/git\s+(checkout|restore)\s+\.\s*$/.test(cmd)) {
    return {
      decision: "block",
      reason: "DESTRUCTIVE: This discards ALL unstaged changes in the working tree.\n" +
        "Alternatives:\n" +
        "  git stash                — save changes for later\n" +
        "  git checkout <file>      — revert specific files only\n" +
        "  git diff                 — review changes first\n" +
        "If you truly need to discard all changes, ask the user first."
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
