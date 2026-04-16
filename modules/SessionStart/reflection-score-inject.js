// WORKFLOW: shtd, gsd
// WHY: Every session starts blank. Without injecting the reflection score,
// Claude has no memory of past performance and repeats the same mistakes.
// This module injects the score, level, streak, and WHY into context so
// every session starts with awareness of its track record.
"use strict";
var path = require("path");

module.exports = function() {
  try {
    var scoreMod = require(path.join(__dirname, "..", "Stop", "reflection-score"));
    var summary = scoreMod.formatSummary();
    if (summary) {
      return { decision: "block", reason: summary };
    }
  } catch (e) {
    // Score module not available — skip silently
  }
  return null;
};
