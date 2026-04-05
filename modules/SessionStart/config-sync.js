// WORKFLOW: shtd
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

    // WHY: Push uses whatever gh auth is active. If CLAUDE_CONFIG_GH_USER is set,
    // switch to that account before pushing and switch back after.
    var configUser = process.env.CLAUDE_CONFIG_GH_USER || "";
    var defaultUser = process.env.CLAUDE_DEFAULT_GH_USER || "";

    if (configUser) {
      cp.execSync("gh auth switch --user " + configUser + " 2>&1", {
        encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000
      });
    }

    try {
      cp.execSync("git push origin main 2>&1", {
        cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000
      });
    } finally {
      if (defaultUser) {
        try {
          cp.execSync("gh auth switch --user " + defaultUser + " 2>&1", {
            encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000
          });
        } catch (e2) { /* ignore */ }
      }
    }

    return { text: "Config sync: committed and pushed " + count + " changed file(s) to cloud backup." };
  } catch (e) {
    if (defaultUser) {
      try {
        cp.execSync("gh auth switch --user " + defaultUser + " 2>&1", {
          encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000
        });
      } catch (e2) { /* ignore */ }
    }
    return { text: "Config sync warning: " + count + " changed file(s) in ~/.claude but push failed: " + (e.message || "").slice(0, 100) };
  }
};
