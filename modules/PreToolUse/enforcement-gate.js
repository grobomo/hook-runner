// TOOLS: Edit, Write
// WORKFLOW: shtd
// WHY: Code edits in repos without TODO.md or with dirty trees caused lost work.
// Enforcement gate: git repo, clean tree, TODO.md required before Edit/Write
var fs = require("fs");
var path = require("path");
var child_process = require("child_process");

module.exports = function(input) {
  var tool = input.tool_name;
  var toolInput = input.tool_input || {};

  // Only gate Edit and Write
  if (tool !== "Edit" && tool !== "Write") return null;

  var targetFile = toolInput.file_path || "";

  // Allow writing TODO.md (bootstrap)
  if (path.basename(targetFile) === "TODO.md") return null;

  // Allow editing ~/.claude/ (user config, not a project)
  var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
  var normalTarget = targetFile.replace(/\\/g, "/");
  if (home && normalTarget.indexOf(home + "/.claude/") === 0) return null;

  // Find project dir
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (targetFile) projectDir = path.dirname(targetFile);
  if (!projectDir) return null;

  // Find git root
  var gitRoot = null;
  var checkDir = projectDir;
  for (var i = 0; i < 20; i++) {
    if (fs.existsSync(path.join(checkDir, ".git"))) {
      gitRoot = checkDir;
      break;
    }
    var parent = path.dirname(checkDir);
    if (parent === checkDir) break;
    checkDir = parent;
  }

  // CHECK 1: No git repo
  if (!gitRoot) {
    return {
      decision: "block",
      reason: "BLOCKED: Code edits in repository without TODO.md or with uncommitted changes\nWHY: Edits in untracked directories have caused lost work when changes were not properly documented or committed\nNEXT STEPS:\n1. Create a TODO.md file in the repository root to track pending changes\n2. Commit all current changes to git before proceeding with new edits\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix enforcement-gate — {describe the issue}\""
    };
  }

  // CHECK 2: Dirty working tree — only on main/master.
  // On task branches, iterative edits before committing are normal workflow.
  // The branch-pr-gate already ensures you're on the right branch.
  try {
    var branch = (input._git && input._git.branch) || "";
    if (!branch) {
      // Read HEAD — handle both regular .git dir and worktree .git file
      var dotGit = path.join(gitRoot, ".git");
      var headPath;
      try {
        var dotGitStat = fs.statSync(dotGit);
        if (dotGitStat.isFile()) {
          var gitdir = fs.readFileSync(dotGit, "utf-8").trim().replace(/^gitdir:\s*/, "");
          if (!path.isAbsolute(gitdir)) gitdir = path.join(gitRoot, gitdir);
          headPath = path.join(gitdir, "HEAD");
        } else {
          headPath = path.join(dotGit, "HEAD");
        }
      } catch (e) { headPath = path.join(dotGit, "HEAD"); }
      var headContent = fs.readFileSync(headPath, "utf-8").trim();
      branch = headContent.indexOf("ref: refs/heads/") === 0 ? headContent.slice(16) : "HEAD";
    }
    // T553: Skip dirty-tree check during active rebase (conflicts are expected)
    // Rebase state dirs live in the gitdir (which may differ from .git for worktrees)
    var gitdirForRebase = path.dirname(headPath); // headPath already resolved through worktree .git file
    var rebaseDir = path.join(gitdirForRebase, "rebase-merge");
    var rebaseApply = path.join(gitdirForRebase, "rebase-apply");
    if (fs.existsSync(rebaseDir) || fs.existsSync(rebaseApply)) {
      // noop — rebase in progress, dirty tree is expected
    } else if (branch === "main" || branch === "master") {
      var status = child_process.execFileSync("git", ["status", "--porcelain"], {
        cwd: gitRoot, encoding: "utf-8", timeout: 5000, windowsHide: true
      }).trim();
      if (status.length > 0) {
        return {
          decision: "block",
          reason: "BLOCKED: Code edits in repository with dirty working tree\nWHY: Uncommitted changes can be lost when hooks or automated processes modify your branch, causing unrecoverable work loss.\nNEXT STEPS:\n1. Run git status to review your uncommitted changes\n2. Commit your changes or stash them before proceeding\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix enforcement-gate — {describe the issue}\""
        };
      }
    }
  } catch (e) {
    // git commands failed, skip check
  }

  // CHECK 3: No TODO.md
  if (!fs.existsSync(path.join(gitRoot, "TODO.md"))) {
    return {
      decision: "block",
      reason: "BLOCKED: Code edits in repository without TODO.md or with uncommitted changes\nWHY: Editing code in repos without a TODO.md file or with a dirty working tree has caused lost work and unclear change tracking.\nNEXT STEPS:\n1. Create a TODO.md file in the repository root documenting your changes\n2. Commit or stash any uncommitted changes before proceeding\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix enforcement-gate — {describe the issue}\""
    };
  }

  return null; // all checks pass
};
