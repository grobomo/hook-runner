// WORKFLOW: shtd, gsd
// WHY: Claude ends sessions with tasks still marked "TESTING NOW" or "IN PROGRESS"
// in TODO.md, or with FAIL/WARN/timeout mentioned but never resolved.
// Next session starts with stale state and wastes time rediscovering issues.
"use strict";

var fs = require("fs");
var path = require("path");

var STALE_MARKERS = /\b(TESTING NOW|IN PROGRESS|INVESTIGATING|DEBUGGING|WIP)\b/i;
var ISSUE_WORDS = /\b(FAIL|MISMATCH|BROKEN|crash(ed|es|ing)?)\b/;

module.exports = function(input) {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  var todoPath = path.join(projectDir, "TODO.md");

  if (!fs.existsSync(todoPath)) return null;

  var content = "";
  try { content = fs.readFileSync(todoPath, "utf-8"); } catch(e) { return null; }

  var lines = content.split("\n");
  var staleItems = [];
  var unresolvedIssues = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Skip completed tasks
    if (/- \[x\]/.test(line)) continue;
    // Only check unchecked task items
    if (!/^\s*-\s*\[ \]/.test(line)) continue;

    // Check for stale progress markers
    if (STALE_MARKERS.test(line)) {
      staleItems.push("  L" + (i + 1) + ": " + line.trim().substring(0, 100));
    }

    // Check for unresolved issue words
    if (ISSUE_WORDS.test(line)) {
      // Skip task descriptions that define gates/detectors (they mention these words by design)
      if (/gate|detector|scan|module|check/i.test(line)) continue;
      unresolvedIssues.push("  L" + (i + 1) + ": " + line.trim().substring(0, 100));
    }
  }

  if (staleItems.length === 0 && unresolvedIssues.length === 0) return null;

  var msg = "UNRESOLVED SESSION STATE in TODO.md:\n\n";

  if (staleItems.length > 0) {
    msg += "Stale progress markers (update to done or blocked):\n";
    msg += staleItems.slice(0, 5).join("\n") + "\n\n";
  }

  if (unresolvedIssues.length > 0) {
    msg += "Unresolved issues (fix, file a plan, or mark complete):\n";
    msg += unresolvedIssues.slice(0, 5).join("\n") + "\n\n";
  }

  msg += "Update TODO.md with actual outcomes before ending the session.";

  return {
    decision: "block",
    reason: msg
  };
};
