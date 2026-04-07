// WORKFLOW: shtd
// WHY: Commits sat on local branches, invisible to mobile monitoring.
"use strict";
// Stop hook: block stopping if there are unpushed commits.
// Forces all work to be visible on GitHub for mobile monitoring.
var cp = require("child_process");

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  try {
    var branch = cp.execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf-8" }).trim();
    if (!branch || branch === "main" || branch === "master") return null;

    var remote = "";
    try {
      remote = cp.execSync("git config --get branch." + branch + ".remote", { cwd: process.cwd(), encoding: "utf-8" }).trim();
    } catch(e) { /* no tracking branch */ }

    if (!remote) {
      return {
        decision: "block",
        reason: "Branch '" + branch + "' has no remote tracking. Push first: git push -u origin " + branch
      };
    }

    var unpushed = cp.execSync("git log " + remote + "/" + branch + "..HEAD --oneline 2>/dev/null", { cwd: process.cwd(), encoding: "utf-8" }).trim();
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
