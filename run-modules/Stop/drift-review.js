"use strict";
// Stop hook: drift review. Before auto-continue, check if recent work
// matches the active spec task. Reads tasks.md, recent git diff, and
// compares. Outputs a warning if work doesn't align with the plan.
//
// Lightweight: no claude -p call, just file reads and pattern matching.
// Runs only when there's an active spec with unchecked tasks.

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

module.exports = function(input) {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return null;

  // Find active spec: look for specs/*/tasks.md with unchecked items
  var specsDir = path.join(projectDir, "specs");
  if (!fs.existsSync(specsDir)) return null;

  var activeSpec = null;
  var activeTask = null;
  var allTasks = [];

  try {
    var specDirs = fs.readdirSync(specsDir).sort().reverse(); // newest first
    for (var i = 0; i < specDirs.length; i++) {
      var tasksFile = path.join(specsDir, specDirs[i], "tasks.md");
      if (!fs.existsSync(tasksFile)) continue;
      var content = fs.readFileSync(tasksFile, "utf8");
      var lines = content.split("\n");

      // Find first unchecked task
      for (var j = 0; j < lines.length; j++) {
        var match = lines[j].match(/^### (T\d+):\s*(.+)/);
        if (match) {
          var taskId = match[1];
          var taskName = match[2];
          // Check if any unchecked items follow this task header
          var hasUnchecked = false;
          for (var k = j + 1; k < lines.length && !lines[k].match(/^### T\d+/); k++) {
            if (/^- \[ \]/.test(lines[k])) {
              hasUnchecked = true;
              break;
            }
          }
          if (hasUnchecked && !activeTask) {
            activeSpec = specDirs[i];
            activeTask = taskId + ": " + taskName;
          }
          allTasks.push({ id: taskId, name: taskName, done: !hasUnchecked });
        }
      }
      if (activeTask) break;
    }
  } catch (e) {
    return null;
  }

  if (!activeTask) return null; // no active work

  // Get current branch
  var branch = "";
  try {
    branch = cp.execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: projectDir, encoding: "utf8", timeout: 5000
    }).trim();
  } catch (e) { return null; }

  // Get recent uncommitted changes
  var diff = "";
  try {
    diff = cp.execSync("git diff --stat HEAD 2>/dev/null || true", {
      cwd: projectDir, encoding: "utf8", timeout: 5000
    }).trim();
  } catch (e) {}

  var uncommitted = "";
  try {
    uncommitted = cp.execSync("git status --porcelain 2>/dev/null || true", {
      cwd: projectDir, encoding: "utf8", timeout: 5000
    }).trim();
  } catch (e) {}

  // Get completed vs total
  var done = allTasks.filter(function(t) { return t.done; }).length;
  var total = allTasks.length;

  // Build drift check
  var warnings = [];

  // Check: branch name should contain the active spec number or task ID
  var specNum = (activeSpec || "").match(/^(\d+)/);
  if (specNum && branch.indexOf(specNum[1]) === -1) {
    warnings.push("Branch '" + branch + "' doesn't match active spec " + activeSpec);
  }

  // Check: uncommitted changes exist (should commit before moving on)
  var uncommittedLines = uncommitted ? uncommitted.split("\n").length : 0;
  if (uncommittedLines > 5) {
    warnings.push(uncommittedLines + " uncommitted changes — commit before continuing");
  }

  // Always output a status line so Claude stays on track
  var status = "DRIFT CHECK — Spec: " + activeSpec + " | Active task: " + activeTask +
    " | Progress: " + done + "/" + total + " tasks done | Branch: " + branch;

  if (warnings.length > 0) {
    status += "\n  WARNINGS:\n  - " + warnings.join("\n  - ");
    status += "\n  STOP and address warnings before continuing.";
  }

  return status;
};
