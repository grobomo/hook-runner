// WORKFLOW: shtd, gsd
// WHY: Multiple Claude tabs working on the same repo directory caused git
// conflicts — stash collisions, dirty working trees, branch switches stomping
// each other's changes. Git worktrees give each branch its own directory,
// so parallel tabs never interfere. This gate blocks feature branch edits
// when another Claude session is active on the same project (multi-tab),
// unless the session is already in a worktree.
"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");

// Detect other active Claude sessions using session-collision-detector lock files
function hasOtherSessions(projectDir) {
  var prefix = ".claude-session-lock-" +
    projectDir.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").substring(0, 80) + "-";
  var myPpid = process.ppid;
  var tmpDir = os.tmpdir();
  try {
    var files = fs.readdirSync(tmpDir);
    for (var i = 0; i < files.length; i++) {
      if (files[i].indexOf(prefix) !== 0) continue;
      var pidStr = files[i].substring(prefix.length);
      var pid = parseInt(pidStr, 10);
      if (isNaN(pid) || pid <= 0 || pid === myPpid) continue;
      // Check if PID is still running (signal 0 = existence check)
      // ESRCH = no such process (dead). EPERM = exists but no permission (alive).
      try {
        process.kill(pid, 0);
        return true; // another session is alive
      } catch(e) {
        if (e.code === "EPERM") return true; // alive but no permission
        // ESRCH = dead — stale lock, ignore
      }
    }
  } catch(e) {}
  return false;
}

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
      var gitStat;
      try { gitStat = fs.statSync(path.join(projectDir, ".git")); } catch(e) { return null; }
      if (gitStat.isFile()) {
        // This IS a worktree — .git is a file pointing to the main repo
        return null; // worktree detected, allow
      }
      var headContent = fs.readFileSync(path.join(projectDir, ".git", "HEAD"), "utf-8").trim();
      if (headContent.indexOf("ref: refs/heads/") === 0) {
        branch = headContent.slice("ref: refs/heads/".length);
      }
    } catch(e) { return null; }
  }

  if (!branch) return null;
  if (branch === "main" || branch === "master") return null;

  // Only enforce when another Claude session is active (multi-tab scenario)
  // Single-tab work on a feature branch is fine in the main checkout
  if (!hasOtherSessions(projectDir)) return null;

  // We're on a feature branch in the main checkout with another session active.
  // Check if this repo has specs/ — only enforce for SHTD workflow repos
  var hasSpecs = fs.existsSync(path.join(projectDir, "specs"));
  if (!hasSpecs) return null;

  // Check if .git is a directory (main checkout) vs file (worktree)
  try {
    var stat = fs.statSync(path.join(projectDir, ".git"));
    if (stat.isFile()) return null; // already in a worktree
  } catch(e) { return null; }

  // Multi-tab + main checkout + feature branch + has specs → block
  var worktreeDir = path.join(path.dirname(projectDir), path.basename(projectDir) + "-worktrees", branch);

  return {
    decision: "block",
    reason: "WORKTREE GATE: Feature branch '" + branch + "' needs a git worktree.\n" +
      "WHY: Another Claude session is active on this project. Working on the same\n" +
      "directory causes git conflicts (stash collisions, branch switches, index.lock).\n\n" +
      "CREATE WORKTREE:\n" +
      "  git worktree add " + worktreeDir + " " + branch + "\n\n" +
      "THEN: Open a new Claude tab in that directory:\n" +
      "  python " + (process.env.CLAUDE_PROJECTS_ROOT || "~/projects") + "/context-reset/context_reset.py --project-dir " + worktreeDir + "\n\n" +
      "CLEANUP when done:\n" +
      "  git worktree remove " + worktreeDir
  };
};
