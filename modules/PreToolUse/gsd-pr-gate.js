// TOOLS: Bash
// WORKFLOW: gsd
// WHY: PRs were created without referencing a GSD phase, making it impossible
// to trace which PR implemented which phase of the roadmap. One PR per phase
// ensures clean audit trail and mobile monitoring via GitHub notifications.
"use strict";
var fs = require("fs");
var path = require("path");
var getActivePhases = require("./_gsd-helpers").getActivePhases;

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
        reason: "BLOCKED: Pull request merged without GSD phase reference\nWHY: PRs created without phase references make it impossible to track work against GSD milestones and impact analysis\nNEXT STEPS:\n1. Add GSD phase identifier to your branch name (e.g., gsd-phase-2-feature-name)\n2. Ensure PR title or description explicitly references the target GSD phase\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gsd-pr-gate — {describe the issue}\""
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
      reason: "BLOCKED: PR creation without GSD phase or task reference\nWHY: PRs created without phase references made it impossible to track work against GSD milestones and caused planning visibility issues\nNEXT STEPS:\n1. Add a GSD phase identifier (e.g., \"GSD-Phase1\" or \"GSD-Task-123\") to your PR title\n2. If unsure of the correct phase, check the GSD project board or ask your tech lead\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix gsd-pr-gate — {describe the issue}\""
    };
  }

  // No title found in command — allow (Claude Code may prompt for it)
  return null;
};
