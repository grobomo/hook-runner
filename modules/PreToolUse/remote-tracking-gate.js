// WORKFLOW: shtd, gsd
// WHY: Commits on untracked branches were invisible on mobile.
"use strict";
// PreToolUse: block code edits if the feature branch doesn't track a remote.
// Ensures all commits auto-push to GitHub for mobile monitoring.
//
// NOTE: This gate intentionally blocks ALL file edits (including ~/.claude/ hooks,
// skills, rules) when on an untracked branch. User wants system config files
// tracked in remotes too (grobomo private repo). If blocked, fix with:
//   git push -u origin <branch-name>
// Do NOT exempt ~/.claude/ paths — that was tried and reverted (2026-04-02).
var cp = require("child_process");

module.exports = function(input) {
  var tool = (input.tool_name || "").toLowerCase();

  // Only gate code-editing tools
  if (tool !== "edit" && tool !== "write") return null;

  // Don't gate config/spec/planning files
  var filePath = "";
  try {
    var ti = typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : (input.tool_input || {});
    filePath = ti.file_path || "";
  } catch(e) {}
  if (/\.(md|json|yaml|yml)$/i.test(filePath)) return null;
  if (/specs\/|\.claude\/|\.github\/|cloudformation\//i.test(filePath)) return null;

  var branch = (input._git && input._git.branch) || "";
  if (!branch || branch === "main" || branch === "master") return null;

  // Use shared tracking info from runner (avoids per-module git spawn)
  var tracking = input._git && typeof input._git.tracking === "string" ? input._git.tracking : null;
  if (tracking === null) {
    // Fallback: runner didn't provide tracking info
    try {
      tracking = cp.execFileSync("git", ["config", "--get", "branch." + branch + ".remote"], { cwd: process.cwd(), encoding: "utf-8", windowsHide: true }).trim();
    } catch(e) {
      tracking = "";
    }
  }
  if (!tracking) {
    return {
      decision: "block",
      reason: "REMOTE TRACKING GATE: Branch '" + branch + "' has no remote tracking.\n" +
        "WHY: Untracked branches are invisible on GitHub Mobile. The dev team monitors\n" +
        "progress via push notifications — if your branch doesn't track a remote,\n" +
        "nobody knows you're working.\n" +
        "FIX: git push -u origin " + branch
    };
  }
  return null;
};
