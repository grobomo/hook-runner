// TOOLS: Bash
// WORKFLOW: gsd
// WHY: Branches created during GSD work had no connection to roadmap phases,
// making it impossible to trace which branch implemented which phase.
// This gate enforces branch naming that maps to active GSD phases.
"use strict";
var getActivePhases = require("./_gsd-helpers").getActivePhases;

// GSD branch pattern: <seq>-phase-<N>-<slug>
// Examples: 001-phase-1-replace-f5, 042-phase-3-e2e-test
var GSD_BRANCH_RE = /^(\d+)-phase-(\d+)-(.+)$/;

// Also allow shtd-style task branches (for mixed workflows)
var TASK_BRANCH_RE = /^\d{3}-T\d{3}/;

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch (e) { cmd = (input.tool_input || {}).command || ""; }

  // Only gate branch creation
  if (!/git\s+checkout\s+-b/.test(cmd)) return null;

  var branchMatch = cmd.match(/git\s+checkout\s+-b\s+(\S+)/);
  if (!branchMatch) return null;

  var branchName = branchMatch[1];

  // Allow shtd-style task branches (for projects using both workflows)
  if (TASK_BRANCH_RE.test(branchName)) return null;

  // Check GSD pattern
  var gsdMatch = branchName.match(GSD_BRANCH_RE);
  if (!gsdMatch) {
    return {
      decision: "block",
      reason: "GSD BRANCH GATE: Branch '" + branchName + "' doesn't follow GSD naming.\n" +
        "Pattern: <seq>-phase-<N>-<slug>\n" +
        "Examples: 001-phase-1-replace-f5, 042-phase-3-e2e-test\n" +
        "Or use shtd-style: <NNN>-T<NNN>-<slug>"
    };
  }

  // Validate phase exists in ROADMAP.md
  var phaseNum = gsdMatch[2];
  var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  var activePhases = getActivePhases(projectDir);

  if (activePhases.length === 0) {
    // No ROADMAP.md or no active phases — allow (gsd-plan-gate handles this)
    return null;
  }

  if (activePhases.indexOf(phaseNum) === -1) {
    return {
      decision: "block",
      reason: "GSD BRANCH GATE: Phase " + phaseNum + " is not an active phase.\n" +
        "Active phases: " + activePhases.join(", ") + "\n" +
        "Check .planning/ROADMAP.md and create a branch for an active phase."
    };
  }

  return null;
};
