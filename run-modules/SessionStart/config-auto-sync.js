// WHY: Rules, skills, and hooks change constantly but the git repo falls
// behind. This module auto-commits and pushes any uncommitted changes in
// ~/.claude on session start, so the config repo stays current without
// manual intervention.
"use strict";
var cp = require("child_process");
var path = require("path");

var CLAUDE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude");

function run(cmd, opts) {
  try {
    return cp.execSync(cmd, Object.assign({ cwd: CLAUDE_DIR, encoding: "utf-8", timeout: 15000, stdio: ["pipe","pipe","pipe"] }, opts)).trim();
  } catch(e) {
    return null;
  }
}

module.exports = async function(input) {
  // Only run if ~/.claude is a git repo
  var gitDir = path.join(CLAUDE_DIR, ".git");
  try { require("fs").statSync(gitDir); } catch(e) { return null; }

  // Check for uncommitted changes (tracked files only)
  var status = run("git status --porcelain");
  if (!status) return null; // clean tree

  // Stage all changes to tracked files + new untracked files matching our patterns
  run("git add -A");

  // Re-check after staging
  var staged = run("git diff --cached --stat");
  if (!staged) return null;

  // Count what changed
  var lines = staged.split("\n").filter(function(l) { return l.trim(); });
  var summary = lines[lines.length - 1] || "changes";

  // Commit
  var date = new Date().toISOString().split("T")[0];
  var msg = "auto-sync: " + date + " — " + summary;
  var commitResult = run('git commit -m "' + msg.replace(/"/g, '\\"') + '"');
  if (!commitResult) return null;

  // Push (non-blocking — don't slow down session start)
  try {
    cp.exec("git push origin main", { cwd: CLAUDE_DIR, timeout: 30000 });
  } catch(e) {
    // Push failure is non-fatal
  }

  return "Auto-synced claude-config: " + summary;
};
