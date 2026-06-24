// WORKFLOW: shtd, gsd, starter
// WHY: Claude stops and lists options instead of doing the work.
// The message text in stop-message.txt was iterated over 15+ versions by the user.
// DO NOT rewrite, condense, or rephrase it. It is a user-authored artifact.
// If you need to change behavior, modify THIS CODE, not the message file.
//
// DISABLED: T667 — superseded by haiku-powered auto-continue-gate.js in 1-haiku/.
// Mechanical always-blockers negate Haiku's DONE decisions and provide no visibility.
"use strict";
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  var idleFlag = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", ".preserved-tab-idle");
  if (fs.existsSync(idleFlag)) {
    try { fs.unlinkSync(idleFlag); } catch(e) {}
    return null;
  }

  var msgPath = path.join(__dirname, "..", "..", "stop-message.txt");
  var message;
  try {
    message = fs.readFileSync(msgPath, "utf-8").trim();
  } catch (e) {
    message = "DO NOT STOP. Check TODO.md for pending tasks and do the next one.";
  }

  return {
    decision: "block",
    reason: message
  };
};
