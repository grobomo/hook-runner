// WORKFLOW: shtd, gsd
// WHY: Config changes (rules, hooks, skills) made during sessions were lost
// because ~/.claude wasn't committed/pushed. This auto-syncs to grobomo/claude-config
// so the cloud copy stays current and new PCs can bootstrap from it.
"use strict";
var fs = require("fs");
var cp = require("child_process");
var path = require("path");

var DEBOUNCE_MS = 3600000; // 1 hour — no need to sync on every session

module.exports = function(input) {
  // Skip git operations during test validation
  if (process.env.HOOK_RUNNER_TEST) return null;
  var claudeDir = path.join(process.env.HOME || process.env.USERPROFILE, ".claude");

  // Debounce: skip if last successful sync was less than 1 hour ago
  var stampPath = path.join(claudeDir, ".config-sync-last-run");
  try {
    var lastRun = parseInt(fs.readFileSync(stampPath, "utf-8").trim(), 10) || 0;
    if (Date.now() - lastRun < DEBOUNCE_MS) return null;
  } catch (e) { /* no stamp = first run, continue */ }

  // Only run if ~/.claude is a git repo
  try {
    cp.execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true
    });
  } catch (e) {
    return null; // not a git repo
  }

  // Check for uncommitted changes (tracked files only)
  var status = "";
  try {
    status = cp.execFileSync("git", ["status", "--porcelain"], {
      cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true
    }).trim();
  } catch (e) {
    return null;
  }

  if (!status) return null; // nothing to sync

  // Count changed files
  var lines = status.split("\n").filter(function(l) { return l.trim(); });
  var count = lines.length;

  // Remove stale index.lock if present (left by crashed git processes)
  var lockFile = path.join(claudeDir, ".git", "index.lock");
  try {
    var lockStat = fs.statSync(lockFile);
    // If lock is older than 60 seconds, it's stale — remove it
    if (Date.now() - lockStat.mtimeMs > 60000) {
      fs.unlinkSync(lockFile);
    }
  } catch (e) { /* no lock file — normal */ }

  // Auto-commit and push
  try {
    cp.execFileSync("git", ["add", "-A"], {
      cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true
    });

    var msg = "auto-sync: " + count + " file(s) changed";
    cp.execFileSync("git", ["commit", "-m", msg], {
      cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true
    });

    // WHY: Push uses whatever gh auth is active. If CLAUDE_CONFIG_GH_USER is set,
    // switch to that account before pushing and switch back after.
    var safeUser = /^[a-zA-Z0-9_-]+$/;
    var configUser = process.env.CLAUDE_CONFIG_GH_USER || "";
    var defaultUser = process.env.CLAUDE_DEFAULT_GH_USER || "";
    if (configUser && !safeUser.test(configUser)) configUser = "";
    if (defaultUser && !safeUser.test(defaultUser)) defaultUser = "";

    if (configUser) {
      cp.execFileSync("gh", ["auth", "switch", "--user", configUser], {
        encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000, windowsHide: true
      });
    }

    // Push current branch (not hardcoded main — repo may be on a different branch)
    var branch = "";
    try {
      // Read .git/HEAD directly — avoids spawning git (slow on Windows)
      var headContent = fs.readFileSync(path.join(claudeDir, ".git", "HEAD"), "utf-8").trim();
      branch = headContent.indexOf("ref: refs/heads/") === 0 ? headContent.slice(16) : "";
    } catch (e) { branch = "main"; }
    if (!/^[a-zA-Z0-9._\-\/]+$/.test(branch)) branch = "main";

    try {
      cp.execFileSync("git", ["push", "origin", branch], {
        cwd: claudeDir, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
        timeout: 15000, windowsHide: true
      });
    } finally {
      if (defaultUser) {
        try {
          cp.execFileSync("gh", ["auth", "switch", "--user", defaultUser], {
            encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000, windowsHide: true
          });
        } catch (e2) { /* ignore */ }
      }
    }

    // Record successful sync time for debounce
    try { fs.writeFileSync(stampPath, String(Date.now())); } catch (e2) { /* best effort */ }
    return { text: "Config sync: committed and pushed " + count + " changed file(s) to cloud backup." };
  } catch (e) {
    if (defaultUser) {
      try {
        cp.execFileSync("gh", ["auth", "switch", "--user", defaultUser], {
          encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 5000, windowsHide: true
        });
      } catch (e2) { /* ignore */ }
    }
    return { text: "Config sync warning: " + count + " changed file(s) in ~/.claude but push failed: " + (e.message || "").slice(0, 100) };
  }
};
