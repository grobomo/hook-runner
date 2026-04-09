// WORKFLOW: shtd
// WHY: Claude rewrote a stop hook module, condensing a user-authored message
// that had been refined over 15 iterations. The message text was treated as
// "my code" instead of a carefully evolved artifact. This gate catches
// full-file rewrites (Write tool) on files with significant git history
// and suggests using Edit instead.
"use strict";
var cp = require("child_process");
var path = require("path");

// Commit count threshold — files with this many+ commits are "iterated"
var ITERATION_THRESHOLD = 5;

module.exports = function(input) {
  if (input.tool_name !== "Write") return null;

  var filePath = (input.tool_input || {}).file_path || "";
  if (!filePath) return null;

  // Only check files in tracked directories (hooks, rules, skills, scripts)
  var norm = filePath.replace(/\\/g, "/");
  var watchedDirs = ["/hooks/", "/rules/", "/skills/", "/scripts/"];
  var isWatched = false;
  for (var i = 0; i < watchedDirs.length; i++) {
    if (norm.indexOf(watchedDirs[i]) !== -1) { isWatched = true; break; }
  }
  if (!isWatched) return null;

  // Check git history — rev-list --count is faster than log --oneline + line counting
  var dir = path.dirname(filePath);
  try {
    var countStr = cp.execFileSync("git", ["rev-list", "--count", "HEAD", "--", path.basename(filePath)],
      { cwd: dir, encoding: "utf-8", timeout: 1500, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
    ).trim();

    var commitCount = parseInt(countStr, 10);
    if (!commitCount || commitCount < ITERATION_THRESHOLD) return null;

    if (commitCount >= ITERATION_THRESHOLD) {
      return {
        decision: "block",
        reason: "CAUTION: Write (full rewrite) on a file with " + commitCount +
          " commits of history. This file has been iterated — a rewrite may " +
          "discard carefully refined content. Use Edit for surgical changes instead. " +
          "If a full rewrite is truly needed, the user must explicitly approve it. " +
          "File: " + path.basename(filePath)
      };
    }
  } catch (e) {
    // Not in a git repo or git error — allow
  }

  return null;
};
