// WORKFLOW: session-management
// WHY: With multiple Claude tabs open, they all show the same title making it
// impossible to find the right session. Setting the terminal title to the CWD
// folder name gives each tab a distinct label. Also fires after context-reset
// since that creates a new session.
"use strict";

var path = require("path");

module.exports = function(input) {
  var folderName = path.basename(process.cwd());
  // ESC ]0; ... BEL sets terminal title in most terminals (Windows Terminal, iTerm2, etc.)
  process.stdout.write("\x1b]0;" + folderName + "\x07");
  return null;
};
