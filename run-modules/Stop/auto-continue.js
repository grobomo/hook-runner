// WHY: Claude stops and lists options instead of doing the work.
// The message text in stop-message.txt was iterated over 15+ versions by the user.
// DO NOT rewrite, condense, or rephrase it. It is a user-authored artifact.
// If you need to change behavior, modify THIS CODE, not the message file.
"use strict";
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  // Read message from external file — separated so code changes can't
  // accidentally alter the carefully iterated user-authored prompt
  var msgPath = path.join(__dirname, "stop-message.txt");
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
