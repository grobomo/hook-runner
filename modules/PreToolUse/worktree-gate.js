// WORKFLOW: shtd
// WHY: Multiple Claude tabs working on the same repo directory caused git
// conflicts — stash collisions, dirty working trees, branch switches stomping
// each other's changes. Git worktrees give each branch its own directory,
// so parallel tabs never interfere. This gate blocks feature branch edits
// unless the session is in a worktree (not the main checkout).
"use strict";
var path = require("path");
var fs = require("fs");
var cp = require("child_process");

module.exports = function(input) {
  var tool = input.tool_name || "";
  // Only gate editing tools
  if (tool !== "Edit" && tool !== "Write") return null;

  // Skip if env says to skip (for testing)
  if (process.env.HOOK_RUNNER_TEST === "1") return null;

  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return null;

  // Check if we're on main/master — those stay in the main checkout
  var branch = "";
  if (input._git && input._git.branch) {
    branch = input._git.branch;
  } else {
    // Read .git/HEAD directly (no child_process spawn)
    try {
      var gitHead = path.join(projectDir, ".git", "HEAD");
      // If .git is a file (worktree), read the gitdir reference
      var gitStat;
      try { gitStat = fs.statSync(path.join(projectDir, ".git")); } catch(e) { return null; }
      if (gitStat.isFile()) {
        // This IS a worktree — .git is a file pointing to the main repo
        return null; // worktree detected, allow
      }
      var headContent = fs.readFileSync(gitHead, "utf-8").trim();
      if (headContent.indexOf("ref: refs/heads/") === 0) {
        branch = headContent.slice("ref: refs/heads/".length);
      }
    } catch(e) { return null; }
  }

  if (!branch) return null;
  if (branch === "main" || branch === "master") return null;

  // We're on a feature branch in the main checkout (not a worktree).
  // Check if this repo has specs/ (hook-runner pattern) — only enforce for repos
  // that use the SHTD workflow with parallel tabs.
  var hasSpecs = fs.existsSync(path.join(projectDir, "specs"));
  if (!hasSpecs) return null;

  // Check if .git is a directory (main checkout) vs file (worktree)
  var gitPath = path.join(projectDir, ".git");
  try {
    var stat = fs.statSync(gitPath);
    if (stat.isFile()) {
      // .git is a file → this is a worktree, allow
      return null;
    }
  } catch(e) { return null; }

  // Main checkout + feature branch + has specs → block
  var worktreeDir = path.join(path.dirname(projectDir), path.basename(projectDir) + "-worktrees", branch);

  return {
    decision: "block",
    reason: "WORKTREE GATE: Feature branch '" + branch + "' should use a git worktree.\n" +
      "WHY: Multiple Claude tabs on the same directory cause git conflicts.\n" +
      "Each branch gets its own directory so tabs never interfere.\n\n" +
      "CREATE WORKTREE:\n" +
      "  git worktree add " + worktreeDir + " " + branch + "\n\n" +
      "THEN: Open a new Claude tab in that directory:\n" +
      "  python ~/Documents/ProjectsCL1/context-reset/context_reset.py --project-dir " + worktreeDir + "\n\n" +
      "CLEANUP when done:\n" +
      "  git worktree remove " + worktreeDir
  };
};
