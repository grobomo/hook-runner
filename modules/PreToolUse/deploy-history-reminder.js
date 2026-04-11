// WORKFLOW: shtd
// WHY: Claude repeats failed deploy approaches because it doesn't check git
// history first. Each E2E cycle is 10+ minutes. Checking recent commits takes
// 2 seconds and prevents wasting 30+ minutes on already-tried approaches.
"use strict";
var cp = require("child_process");

var DEPLOY_PATTERNS = [
  /upload-and-run/,
  /quick-sync/,
  /create-zip/,
  /terraform\s+apply/,
  /az\s+vm\s+run-command\s+create/
];

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  var matched = false;
  for (var i = 0; i < DEPLOY_PATTERNS.length; i++) {
    if (DEPLOY_PATTERNS[i].test(cmd)) { matched = true; break; }
  }
  if (!matched) return null;

  // Non-blocking — just log recent history as advisory
  var history = "";
  try {
    history = cp.execFileSync("git", ["log", "--oneline", "-5"], {
      encoding: "utf-8", timeout: 5000, windowsHide: true
    }).trim();
  } catch(e) {
    return null;
  }

  if (!history) return null;

  // Return as text advisory (non-blocking)
  return {
    text: "DEPLOY REMINDER: Recent commits before this run:\n" + history +
      "\nVerify you're not repeating a failed approach."
  };
};
