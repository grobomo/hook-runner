// WORKFLOW: shtd
// WHY: Need to detect when the user interrupts Claude mid-response.
// Interrupts are social cues that something went wrong — they should
// trigger self-analysis. This module writes a marker file when Claude
// finishes a turn normally. If the marker is missing when the next
// UserPromptSubmit fires, the previous turn was interrupted.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

// T337: Include parent PID in filename for session isolation across tabs
var MARKER = path.join(os.tmpdir(), ".claude-turn-complete-" + process.ppid);

module.exports = function(input) {
  try {
    fs.writeFileSync(MARKER, JSON.stringify({
      ts: new Date().toISOString(),
      project: process.env.CLAUDE_PROJECT_DIR || ""
    }));
  } catch (e) {
    // best effort
  }
  // Don't block — this is just a side effect
  return null;
};
