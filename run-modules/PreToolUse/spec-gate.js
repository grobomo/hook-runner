// WHY: Claude implemented features that nobody asked for, wasting hours.
// This gate ensures all code maps to a speckit task.
"use strict";
// requires: enforcement-gate
// Spec gate: blocks code edits unless work maps to an unchecked task in tasks.md.
// If you're doing undocumented work, add it to the spec first.
// Allows: config, specs, planning, rules, hooks, TODO.md, SESSION_STATE.md
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var targetFile = "";
  try { targetFile = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || ""; } catch(e) { targetFile = (input.tool_input || {}).file_path || ""; }
  if (!targetFile) return null;
  var norm = targetFile.replace(/\\/g, "/");

  // Allow bootstrap/config/planning files on any branch
  var allowPatterns = [
    /TODO\.md$/, /SESSION_STATE\.md$/, /CLAUDE\.md$/,
    /\.claude\//, /\/specs\//, /\.planning\//, /\.specify\//,
    /\.github\//, /\/hooks\//, /\/rules\//,
    /\.gitignore$/, /\.json$/,  // package.json, tsconfig, etc
    /scripts\/test\//,
  ];
  for (var i = 0; i < allowPatterns.length; i++) {
    if (allowPatterns[i].test(norm)) return null;
  }

  // Allow user home config
  var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
  if (home && norm.startsWith(home + "/.claude/")) return null;

  // Find specs dirs (project dir + target file's git root)
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var roots = [];
  if (projectDir) roots.push(projectDir);

  var dir = path.dirname(targetFile);
  for (var d = 0; d < 20; d++) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      var r = dir.replace(/\\/g, "/");
      if (roots.indexOf(r) === -1) roots.push(r);
      break;
    }
    var parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (roots.length === 0) return null;

  // Find all tasks.md files across roots
  var allTasks = [];
  for (var ri = 0; ri < roots.length; ri++) {
    var specsDir = path.join(roots[ri], "specs");
    if (!fs.existsSync(specsDir)) continue;
    try {
      var specDirs = fs.readdirSync(specsDir);
      for (var j = 0; j < specDirs.length; j++) {
        var tf = path.join(specsDir, specDirs[j], "tasks.md");
        if (fs.existsSync(tf)) allTasks.push(tf);
      }
    } catch(e) {}
  }

  // No specs at all — block
  if (allTasks.length === 0) {
    return {
      decision: "block",
      reason: "SPEC GATE: No specs/ with tasks.md found.\n" +
        "WHY: Every change must be specced so the dev team can see what you're doing\n" +
        "and why via GitHub PRs. Unspecced work is invisible — nobody can review it,\n" +
        "understand the intent, or track progress. Specs ARE the project history.\n" +
        "FIX:\n" +
        "  1. /speckit.specify — define what and why\n" +
        "  2. /speckit.plan — design the approach\n" +
        "  3. /speckit.tasks — generate trackable tasks\n" +
        "Blocked: " + path.basename(targetFile)
    };
  }

  // Check that at least one tasks.md has unchecked tasks
  var hasUnchecked = false;
  for (var k = 0; k < allTasks.length; k++) {
    try {
      var content = fs.readFileSync(allTasks[k], "utf-8");
      if (/- \[ \] T\d+/.test(content)) {
        hasUnchecked = true;
        break;
      }
    } catch(e) {}
  }

  if (!hasUnchecked) {
    return {
      decision: "block",
      reason: "SPEC GATE: All tasks checked off — no unchecked work to do.\n" +
        "WHY: Every change must map to a spec task so the dev team can track progress\n" +
        "through PRs. Undocumented work is invisible and can't be reviewed or monitored.\n" +
        "FIX: Add the new work to specs/<feature>/tasks.md, or /speckit.specify for a new feature.\n" +
        "Blocked: " + path.basename(targetFile)
    };
  }

  return null;
};
