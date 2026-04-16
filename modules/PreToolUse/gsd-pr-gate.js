// TOOLS: Bash
// WORKFLOW: gsd
// WHY: PRs were created without referencing a GSD phase, making it impossible
// to trace which PR implemented which phase of the roadmap. One PR per phase
// ensures clean audit trail and mobile monitoring via GitHub notifications.
"use strict";
var fs = require("fs");
var path = require("path");

/**
 * Parse active phase numbers from ROADMAP.md
 */
function getActivePhases(projectDir) {
  var roadmap = path.join(projectDir, ".planning", "ROADMAP.md");
  if (!fs.existsSync(roadmap)) return [];

  try {
    var content = fs.readFileSync(roadmap, "utf-8");
    var phases = [];
    var inActive = false;
    var lines = content.split("\n");

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^##\s+Active Milestone/i.test(line)) {
        inActive = true;
        continue;
      }
      if (inActive && /^##\s/.test(line) && !/^###/.test(line)) break;
      if (inActive) {
        var phaseMatch = line.match(/^###\s+Phase\s+(\d+)/i);
        if (phaseMatch) phases.push(phaseMatch[1]);
      }
    }
    return phases;
  } catch (e) {
    return [];
  }
}

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch (e) { cmd = (input.tool_input || {}).command || ""; }

  // Only gate PR creation
  if (!/gh\s+pr\s+create/.test(cmd)) return null;

  // Check current branch — must be a phase branch or task branch
  var branch = "";
  if (input._git && input._git.branch) {
    branch = input._git.branch;
  } else {
    var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
    try {
      var head = fs.readFileSync(path.join(projectDir, ".git", "HEAD"), "utf-8").trim();
      if (head.indexOf("ref: refs/heads/") === 0) branch = head.slice(16);
    } catch (e) {}
  }

  if (!branch) return null;

  // Allow shtd-style task branches (for mixed workflows)
  if (/^\d{3}-T\d{3}/.test(branch)) return null;

  // For GSD branches, verify the phase is active
  var gsdMatch = branch.match(/^\d+-phase-(\d+)/);
  if (gsdMatch) {
    var phaseNum = gsdMatch[1];
    var projectDir2 = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    var activePhases = getActivePhases(projectDir2);

    if (activePhases.length > 0 && activePhases.indexOf(phaseNum) === -1) {
      return {
        decision: "block",
        reason: "GSD PR GATE: Branch references phase " + phaseNum + " which is not active.\n" +
          "Active phases: " + activePhases.join(", ") + "\n" +
          "Create a PR from a branch that maps to an active phase."
      };
    }
    return null; // valid GSD phase branch
  }

  // Branch doesn't follow GSD or shtd naming — check PR title for phase reference
  var titleMatch = cmd.match(/--title\s+["']([^"']+)["']/);
  if (titleMatch) {
    var title = titleMatch[1];
    // Accept phase references (Phase 1, phase-1, P1) or task IDs (T001)
    if (/phase[\s-]*\d+/i.test(title) || /T\d{3}/.test(title)) {
      return null;
    }
    return {
      decision: "block",
      reason: "GSD PR GATE: PR title must reference a phase or task.\n" +
        "Branch '" + branch + "' doesn't follow GSD naming, and title\n" +
        "'" + title + "' has no phase reference.\n" +
        "Add 'Phase N:' to the title, or use a phase branch: <seq>-phase-<N>-<slug>"
    };
  }

  // No title found in command — allow (Claude Code may prompt for it)
  return null;
};
