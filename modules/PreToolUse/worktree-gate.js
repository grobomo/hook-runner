// WORKFLOW: shtd, gsd
// WHY: Multiple Claude tabs on the same repo directory cause git conflicts —
// stash collisions, dirty working trees, index.lock contention, branch switches
// stomping each other's changes. Git worktrees give each tab its own directory.
// This gate enforces worktree usage: edits in the main checkout are blocked,
// forcing Claude to use EnterWorktree for an isolated working directory.
"use strict";
var path = require("path");
var fs = require("fs");

module.exports = function(input) {
  var tool = input.tool_name || "";
  // Only gate editing tools
  if (tool !== "Edit" && tool !== "Write") return null;

  // Skip if env says to skip (for testing)
  if (process.env.HOOK_RUNNER_TEST === "1") return null;

  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return null;

  // T469: Check CWD — may be in a worktree inside the project dir even if
  // CLAUDE_PROJECT_DIR points to the main checkout. Only check if CWD is
  // inside projectDir to avoid test contamination from external CWDs.
  var cwdNorm = process.cwd().replace(/\\/g, "/");
  var projNorm = projectDir.replace(/\\/g, "/");
  if (cwdNorm.indexOf(projNorm) === 0 && cwdNorm !== projNorm) {
    try {
      if (fs.statSync(path.join(cwdNorm, ".git")).isFile()) {
        // CWD .git is a file → in a worktree inside the project. Allow edits.
        return null;
      }
    } catch(e) { /* no .git in cwd, check projectDir */ }
  }

  // Check if .git exists and whether it's a directory (main checkout) or file (worktree)
  var gitPath = path.join(projectDir, ".git");
  try {
    var gitStat = fs.statSync(gitPath);
    if (gitStat.isFile()) {
      // .git is a file → already in a worktree. Allow edits.
      return null;
    }
  } catch(e) {
    // No .git at all — not a git repo, skip
    return null;
  }

  // We're in the main checkout (.git is a directory).
  // Read current branch to check if we're on main/master.
  var branch = "";
  if (input._git && input._git.branch) {
    branch = input._git.branch;
  } else {
    try {
      var headContent = fs.readFileSync(path.join(gitPath, "HEAD"), "utf-8").trim();
      if (headContent.indexOf("ref: refs/heads/") === 0) {
        branch = headContent.slice("ref: refs/heads/".length);
      }
    } catch(e) { return null; }
  }

  // Allow config/doc files on main (same allowlist as branch-pr-gate)
  var targetFile = "";
  try {
    targetFile = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || "";
  } catch(e) { targetFile = (input.tool_input || {}).file_path || ""; }

  if (targetFile) {
    var norm = targetFile.replace(/\\/g, "/");
    var allowPatterns = [
      /TODO\.md$/, /SESSION_STATE\.md$/, /CLAUDE\.md$/, /README\.md$/,
      /\.claude\//, /\/specs\//, /\.planning\//, /\.specify\//,
      /\.github\//, /\/hooks\//, /\/rules\//,
      /\.gitignore$/, /scripts\/test\//, /\.json$/,
    ];
    for (var i = 0; i < allowPatterns.length; i++) {
      if (allowPatterns[i].test(norm)) return null;
    }
  }

  // Main checkout + code file edit → blocked. EnterWorktree is the only way.
  return {
    decision: "block",
    reason: "WORKTREE GATE: Edits blocked — you are in the main checkout.\n" +
      "WHY: Multiple Claude tabs work on this project simultaneously.\n" +
      "The main checkout stays clean. All work happens in worktrees.\n\n" +
      "REQUIRED: Call the EnterWorktree tool now.\n" +
      "It creates an isolated directory with its own branch. No alternatives.\n" +
      "When done: commit, push, PR, then ExitWorktree."
  };
};
