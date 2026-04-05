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
      reason: "No git repo at " + projectDir + ". Run: git init && git add -A && git commit -m 'Initial commit'. Every project must be tracked in git."
    };
  }

  // CHECK 2: Dirty working tree — only on main/master.
  // On task branches, iterative edits before committing are normal workflow.
  // The branch-pr-gate already ensures you're on the right branch.
  try {
    var branch = (input._git && input._git.branch) || "";
    if (!branch) {
      branch = child_process.execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: gitRoot, encoding: "utf-8", timeout: 5000
      }).trim();
    }
    if (branch === "main" || branch === "master") {
      var status = child_process.execSync("git status --porcelain", {
        cwd: gitRoot, encoding: "utf-8", timeout: 5000
      }).trim();
      if (status.length > 0) {
        return {
          decision: "block",
          reason: "Dirty working tree on " + branch + " in " + gitRoot + ". Commit or branch before making new changes. Run: git add <files> && git commit -m 'description'"
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
      reason: "No TODO.md in " + gitRoot + ". Write a plan to TODO.md before making code changes. Document what you're doing and why."
    };
  }

  return null; // all checks pass
};
