"use strict";
// PreToolUse: block code edits if the feature branch doesn't track a remote.
// Ensures all commits auto-push to GitHub for mobile monitoring.
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

  try {
    var branch = cp.execSync("git branch --show-current", { cwd: process.cwd(), encoding: "utf-8" }).trim();
    if (!branch || branch === "main" || branch === "master") return null;

    try {
      cp.execSync("git config --get branch." + branch + ".remote", { cwd: process.cwd(), encoding: "utf-8" });
    } catch(e) {
      return {
        decision: "block",
        reason: "Branch '" + branch + "' has no remote tracking. Run: git push -u origin " + branch + " — all work must be visible on GitHub."
      };
    }
  } catch(e) {
    // Not a git repo — don't block
  }
  return null;
};
