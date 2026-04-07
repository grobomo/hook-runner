// WORKFLOW: shtd
// WHY: Self-reflection module (Stop event) flags workflow violations via LLM
// analysis, but those flags are useless if Claude keeps editing without seeing
// them. This gate checks the reflection log for unresolved high-severity issues
// and blocks production code edits until they're addressed.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var REFLECTION_PATH = path.join(os.homedir(), ".claude", "hooks", "self-reflection.jsonl");
var MAX_AGE_MS = 60 * 60 * 1000; // Ignore reflections older than 1 hour

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  // Allow config/planning files through — same as spec-gate
  var targetFile = "";
  try {
    var toolInput = typeof input.tool_input === "string"
      ? JSON.parse(input.tool_input) : input.tool_input || {};
    targetFile = (toolInput.file_path || "").replace(/\\/g, "/");
  } catch (e) { return null; }

  if (!targetFile) return null;

  // Allow non-production files through
  // NOTE: self-reflection.jsonl is NOT exempted — Claude must fix the actual
  // issue, not edit the log to unblock itself. The reflection loop will
  // re-analyze and clear the issue when the fix is genuinely done.
  //
  // Self-repair: reflection CAN fix hook-runner modules (its own system) but
  // delegates everything else via TODOs. The /run-modules/ and hook-runner
  // modules/ patterns enable this. General /hooks/ is NOT allowed — only the
  // specific module directories where self-reflection lives.
  var allowPatterns = [
    /TODO\.md$/, /SESSION_STATE\.md$/, /CLAUDE\.md$/,
    /\.claude\//, /\/specs\//, /\/rules\//,
    /\.gitignore$/, /package\.json$/,
    /\/run-modules\//, // live hook modules (self-repair)
    /hook-runner\/modules\//, // hook-runner catalog (self-repair)
    /hook-runner\/load-modules\.js$/, // module loader
    /hook-runner\/run-async\.js$/, // async runner
    /hook-runner\/run-[a-z]+\.js$/, // event runners
    /hook-runner\/hook-log\.js$/, // logger
    /hook-runner\/workflow\.js$/, // workflow engine
    /hook-runner\/workflow-cli\.js$/ // workflow CLI
  ];
  for (var i = 0; i < allowPatterns.length; i++) {
    if (allowPatterns[i].test(targetFile)) return null;
  }

  // Read reflection log
  try {
    if (!fs.existsSync(REFLECTION_PATH)) return null;
    var content = fs.readFileSync(REFLECTION_PATH, "utf-8").trim();
    if (!content) return null;

    var lines = content.split("\n");
    var now = Date.now();
    var unresolvedIssues = [];

    for (var li = lines.length - 1; li >= 0 && li >= lines.length - 20; li--) {
      try {
        var entry = JSON.parse(lines[li]);
        // Skip resolved entries
        if (entry.resolved) continue;
        // Skip old entries
        var age = now - new Date(entry.ts).getTime();
        if (age > MAX_AGE_MS) continue;
        // Skip clean verdicts
        if (entry.verdict === "clean") continue;

        // Collect high/medium severity issues
        var issues = entry.issues || [];
        for (var j = 0; j < issues.length; j++) {
          if (issues[j].severity === "high" || issues[j].severity === "medium") {
            unresolvedIssues.push(issues[j]);
          }
        }
      } catch (e) { continue; }
    }

    if (unresolvedIssues.length === 0) return null;

    // Build block message
    var msg = "REFLECTION GATE: Unresolved issues from self-reflection.\n";
    msg += "The self-reflection module (LLM analysis) found problems with recent work:\n\n";
    for (var k = 0; k < unresolvedIssues.length; k++) {
      var issue = unresolvedIssues[k];
      msg += "  [" + issue.severity + "] " + issue.description + "\n";
      if (issue.fix) msg += "    FIX: " + issue.fix + "\n";
    }
    msg += "\nTO RESOLVE: Fix the issues above, then mark them resolved by editing\n";
    msg += REFLECTION_PATH + "\n";
    msg += "(set \"resolved\": true on the entry, or delete the file to clear all)\n";
    msg += "Blocked: " + path.basename(targetFile);

    return { decision: "block", reason: msg };
  } catch (e) {
    return null; // Never block on log read errors
  }
};
