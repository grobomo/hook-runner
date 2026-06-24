// WORKFLOW: shtd, gsd, haiku-rules
// WHY: Commits sat on local branches, invisible to mobile monitoring.
"use strict";
// Stop hook: block stopping if there are unpushed commits.
// Forces all work to be visible on GitHub for mobile monitoring.
var cp = require("child_process");

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  try {
    var branch = cp.execFileSync("git", ["branch", "--show-current"], { cwd: process.cwd(), encoding: "utf-8", windowsHide: true }).trim();
    if (!branch || branch === "main" || branch === "master") return null;

    var remote = "";
    try {
      remote = cp.execFileSync("git", ["config", "--get", "branch." + branch + ".remote"], { cwd: process.cwd(), encoding: "utf-8", windowsHide: true }).trim();
    } catch(e) { /* no tracking branch */ }

    if (!remote) {
      return {
        decision: "block",
        reason: "BLOCKED: Push to branch with unpushed commits\nWHY: Commits remaining on local branches become invisible to mobile monitoring systems, delaying detection of integration issues\nNEXT STEPS:\n1. Push all local commits to remote before proceeding\n2. Verify branch is up to date with origin using git status\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix push-unpushed — {describe the issue}\""
      };
    }

    var unpushed = cp.execFileSync("git", ["log", remote + "/" + branch + "..HEAD", "--oneline"], { cwd: process.cwd(), encoding: "utf-8", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (unpushed) {
      var count = unpushed.split("\n").length;
      return {
        decision: "block",
        reason: count + " unpushed commit(s) on " + branch + ". Push before stopping: git push"
      };
    }
  } catch(e) {
    // Not a git repo or other error — don't block
  }
  return null;
};
