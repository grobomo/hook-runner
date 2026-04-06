// WORKFLOW: shtd
// WHY: Claude masked bugs with cleanup instead of fixing root causes.
// Root cause gate: block retry/cleanup patterns without diagnosis
// Detects when Claude is about to re-run a command that just failed,
// or clean up a mess without fixing why it happened.
var fs = require("fs");
var path = require("path");

// NOTE: rebase --abort and merge --abort are NOT cleanup — they're recovery.
// Blocking them traps you in a broken state. They were removed from this list.
var CLEANUP_PATTERNS = [
  /git reset --hard/,
  /git checkout -- \.$/,
  /rm -rf.*requests\//,
  /mv.*requests\/failed/,
  /mv.*requests\/dispatched.*archived/,
];

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";

  for (var i = 0; i < CLEANUP_PATTERNS.length; i++) {
    if (CLEANUP_PATTERNS[i].test(cmd)) {
      return {
        decision: "block",
        reason: "Root cause first: you're about to clean up a symptom. Before running this, diagnose WHY it happened and fix the root cause. What caused the dirty state / conflict / failure? Fix that first, then clean up."
      };
    }
  }

  return null;
};
