// WORKFLOW: session-management
// WHY: Config changes (rules, hooks, skills) made during sessions were lost
// because ~/.claude wasn't committed/pushed. This auto-syncs to grobomo/claude-config
// so the cloud copy stays current and new PCs can bootstrap from it.
"use strict";
var cp = require("child_process");
var path = require("path");

module.exports = function(input) {
  var claudeDir = path.join(process.env.HOME || process.env.USERPROFILE, ".claude");

  // Only run if ~/.claude is a git repo
  try {
    cp.execSync("git rev-parse --is-inside-work-tree", {
      cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"]
    });
  } catch (e) {
    return null; // not a git repo
  }

  // Check for uncommitted changes (tracked files only)
  var status = "";
  try {
    status = cp.execSync("git status --porcelain", {
      cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"]
    }).trim();
  } catch (e) {
    return null;
  }

  if (!status) return null; // nothing to sync

  // Count changed files
  var lines = status.split("\n").filter(function(l) { return l.trim(); });
  var count = lines.length;

  // Auto-commit and push
  try {
    cp.execSync("git add -A", {
      cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"]
    });

    var msg = "auto-sync: " + count + " file(s) changed";
    cp.execSync('git commit -m "' + msg + '"', {
      cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"]
    });

    // Switch to grobomo (claude-config repo owner) before pushing
    cp.execSync("gh auth switch --user grobomo 2>&1", {
      encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000
    });

    try {
      cp.execSync("git push origin main 2>&1", {
        cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000
      });
    } finally {
      // Always switch back to default
      try {
        cp.execSync("gh auth switch --user joel-ginsberg_tmemu 2>&1", {
          encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000
        });
      } catch (e2) { /* ignore */ }
    }

    return { text: "Config sync: committed and pushed " + count + " changed file(s) to grobomo/claude-config." };
  } catch (e) {
    // Switch back on error too
    try {
      cp.execSync("gh auth switch --user joel-ginsberg_tmemu 2>&1", {
        encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000
      });
    } catch (e2) { /* ignore */ }
    return { text: "Config sync warning: " + count + " changed file(s) in ~/.claude but push failed: " + (e.message || "").slice(0, 100) };
  }
};
