// Shared helper for shtd workflow prerequisite enforcement.
// T794: When shtd is enabled, missing prerequisites MUST block (not go dormant).
//
// Usage in a gate:
//   var shtd = require("./_shtd-enforce");
//   var prereqBlock = shtd.requirePrereq(projectDir, prereqPath, {
//     name: "specs/tasks.md",
//     why: "Code edits require a spec with tracked tasks",
//     createSteps: [
//       "Create specs/<feature>/spec.md with the feature description",
//       "Add specs/<feature>/tasks.md with a task checklist"
//     ]
//   });
//   if (prereqBlock) return prereqBlock; // block with instructions
//   // prerequisite exists — continue with gate logic
"use strict";

var fs = require("fs");
var path = require("path");

// Cache workflow enabled check per process (workflow config doesn't change mid-session)
var _shtdEnabledCache = {};

/**
 * Check if shtd workflow is enabled for the given hooks directory.
 * Caches result per hooksDir.
 */
function isShtdEnabled(hooksDir) {
  if (!hooksDir) {
    hooksDir = path.join(
      process.env.HOME || process.env.USERPROFILE || "",
      ".claude", "hooks"
    );
  }
  if (hooksDir in _shtdEnabledCache) return _shtdEnabledCache[hooksDir];

  var result = false;
  try {
    var wfPath = path.join(path.dirname(__dirname), "..", "workflow.js");
    if (fs.existsSync(wfPath)) {
      var wf = require(wfPath);
      result = wf.isWorkflowEnabled("shtd", hooksDir);
    }
  } catch (e) {}

  _shtdEnabledCache[hooksDir] = result;
  return result;
}

/**
 * Enforce a prerequisite for shtd workflow.
 *
 * @param {string} projectDir - Project root directory
 * @param {string} prereqPath - Full path to required file/directory
 * @param {object} opts
 * @param {string} opts.name - Human-readable name of the prerequisite
 * @param {string} opts.why - One sentence explaining WHY this is required
 * @param {string[]} opts.createSteps - Steps to create the prerequisite
 * @param {string} [opts.gateName] - Name of the calling gate (for FALSE POSITIVE message)
 * @returns {null|{decision:string, reason:string}} null if OK, block decision if missing
 */
function requirePrereq(projectDir, prereqPath, opts) {
  // If shtd workflow is not enabled, this gate is dormant (correct behavior)
  if (!isShtdEnabled()) return null;

  // If prerequisite exists, all good
  try {
    fs.accessSync(prereqPath, fs.constants.F_OK);
    return null;
  } catch (e) {
    // prerequisite missing — block
  }

  var gateName = opts.gateName || "the calling gate";
  var steps = (opts.createSteps || []).map(function(s, i) {
    return (i + 1) + ". " + s;
  }).join("\n");

  return {
    decision: "block",
    reason: [
      "BLOCKED: shtd workflow requires " + opts.name,
      "WHY: " + opts.why,
      "NEXT STEPS:",
      steps,
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix " + gateName + " — {describe the issue}\""
    ].join("\n")
  };
}

module.exports = {
  isShtdEnabled: isShtdEnabled,
  requirePrereq: requirePrereq
};
