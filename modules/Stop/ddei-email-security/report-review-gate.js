// WORKFLOW: shtd
// WHY: PDF reports were generated and declared "done" without visual review.
// Claude skipped the 5-pass review loop, shipping reports with overflowing
// tables, missing data, and broken layouts. This gate blocks Stop until
// review-notes-*.md exists with all 5 passes documented.
//
// Migrated from ddei-email-security/.claude/hooks/report-review-gate.js
// Original bugs: hardcoded path (wrong), relative command path (cwd drift),
// process.cwd() instead of CLAUDE_PROJECT_DIR.

var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  // Only fire in ddei-email-security projects
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (projectDir.indexOf("ddei-email-security") === -1) return null;

  var resultsDir = path.join(projectDir, "test-results");
  if (!fs.existsSync(resultsDir)) return null;

  // Find PDF reports modified in last 2 hours
  var twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  var files;
  try {
    files = fs.readdirSync(resultsDir);
  } catch (e) {
    return null;
  }

  var recentPdfs = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (f.indexOf("deployment_report_") !== 0) continue;
    if (f.slice(-4) !== ".pdf") continue;
    try {
      var stat = fs.statSync(path.join(resultsDir, f));
      if (stat.mtimeMs > twoHoursAgo) recentPdfs.push(f);
    } catch (e) { /* skip unreadable */ }
  }

  if (recentPdfs.length === 0) return null;

  // Check for review notes
  var recentNotes = [];
  for (var j = 0; j < files.length; j++) {
    var n = files[j];
    if (n.indexOf("review-notes-") !== 0) continue;
    if (n.slice(-3) !== ".md") continue;
    try {
      var nstat = fs.statSync(path.join(resultsDir, n));
      if (nstat.mtimeMs > twoHoursAgo) recentNotes.push(n);
    } catch (e) { /* skip */ }
  }

  if (recentNotes.length === 0) {
    return {
      decision: "block",
      reason: "PDF report generated (" + recentPdfs[recentPdfs.length - 1] +
        ") but no review-notes-*.md found in test-results/.\n" +
        "Run the 5-pass review loop before stopping.\n" +
        "See .claude/rules/report-review.md."
    };
  }

  // Check review notes have 5 passes
  recentNotes.sort();
  var latestNote = recentNotes[recentNotes.length - 1];
  var noteContent;
  try {
    noteContent = fs.readFileSync(path.join(resultsDir, latestNote), "utf-8");
  } catch (e) {
    return null;
  }

  var passMatches = noteContent.match(/^## Pass \d/gm);
  var passCount = passMatches ? passMatches.length : 0;

  if (passCount < 5) {
    return {
      decision: "block",
      reason: "Review notes (" + latestNote + ") only have " + passCount +
        "/5 passes documented. Complete all 5 passes before stopping."
    };
  }

  return null;
};
