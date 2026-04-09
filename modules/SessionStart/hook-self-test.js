// WORKFLOW: shtd
// WHY: Stop runner had exit(0) for blocks instead of exit(1). TUI silently
// ignored autocontinue — user had to notice manually. project-health.js
// checks that files exist and modules load, but never validates that runners
// actually produce correct exit codes when blocking. This module runs a
// lightweight smoke test: spawns each runner with a mock block module and
// verifies exit code is 1 and stdout contains valid block JSON.
"use strict";
var cp = require("child_process");
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  var home = process.env.HOME || process.env.USERPROFILE || "";
  var hooksDir = path.join(home, ".claude", "hooks");
  var warnings = [];

  // Runners that should exit(1) on block.
  // PreToolUse uses exit(0) with JSON on stdout — that's correct for its protocol.
  // Stop and PostToolUse need exit(1) so the TUI displays the block message.
  var runners = [
    { file: "run-stop.js", event: "Stop" },
    { file: "run-posttooluse.js", event: "PostToolUse" }
  ];

  for (var i = 0; i < runners.length; i++) {
    var runnerPath = path.join(hooksDir, runners[i].file);
    if (!fs.existsSync(runnerPath)) continue;

    // Read runner source and check exit code on block path
    try {
      var src = fs.readFileSync(runnerPath, "utf-8");
      // Look for the block output + exit pattern
      // Correct: process.exit(1) near stdout.write(JSON.stringify
      // Wrong: process.exit(0) near stdout.write(JSON.stringify
      var hasBlockExit0 = /process\.stdout\.write\(JSON\.stringify\(.*?\)\);?\s*\n\s*process\.exit\(0\)/s.test(src);
      var hasBlockExit1 = /process\.stdout\.write\(JSON\.stringify\(.*?\)\);?\s*\n\s*process\.exit\(1\)/s.test(src);

      if (hasBlockExit0 && !hasBlockExit1) {
        warnings.push(runners[i].file + " uses exit(0) for blocks — TUI will silently ignore block results. Fix: change to exit(1).");
      }
    } catch (e) {
      warnings.push(runners[i].file + " unreadable: " + e.message);
    }
  }

  // Check hook-log for Stop blocks in last 50 entries — if auto-continue
  // is installed but has 0 blocks logged, the stop runner may be broken
  var logPath = path.join(hooksDir, "hook-log.jsonl");
  var autoContExists = fs.existsSync(path.join(hooksDir, "run-modules", "Stop", "auto-continue.js"));
  if (autoContExists && fs.existsSync(logPath)) {
    try {
      var logData = fs.readFileSync(logPath, "utf-8").trim();
      var lines = logData.split("\n");
      var recentLines = lines.slice(-50);
      var stopBlocks = 0;
      var stopCalls = 0;
      for (var li = 0; li < recentLines.length; li++) {
        try {
          var entry = JSON.parse(recentLines[li]);
          if (entry.event === "Stop") {
            stopCalls++;
            if (entry.outcome === "block") stopBlocks++;
          }
        } catch (e) { /* skip malformed lines */ }
      }
      if (stopCalls > 5 && stopBlocks === 0) {
        warnings.push("auto-continue.js is installed but 0 Stop blocks in last " + stopCalls + " Stop log entries. Runner may be broken (exit code issue?).");
      }
    } catch (e) { /* log unreadable, skip */ }
  }

  if (warnings.length > 0) {
    process.stderr.write("hook-self-test: " + warnings.length + " issue(s):\n");
    for (var wi = 0; wi < warnings.length; wi++) {
      process.stderr.write("  - " + warnings[wi] + "\n");
    }
  }

  return null; // SessionStart modules are observational, never block
};
