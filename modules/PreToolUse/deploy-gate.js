// TOOLS: Bash
// WORKFLOW: shtd, gsd
// WHY: E2E deploy cycles take 10+ minutes. When deployed from a dirty tree,
// results can't be traced to a specific commit SHA. Wasted debugging time
// when you can't reproduce what was actually deployed.
"use strict";
var cp = require("child_process");

// Commands that deploy or run code on remote infrastructure
var DEPLOY_PATTERNS = [
  /upload-and-run/,
  /quick-sync/,
  /create-zip/,
  /terraform\s+apply/,
  /az\s+vm\s+run-command\s+create/,
  /aws\s+(?:s3\s+cp|lambda\s+update|ecs\s+update|deploy)/,
  /kubectl\s+apply/,
  /docker\s+push/,
  /scp\s+.*:/,
  /rsync\s+.*:/
];

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  // Check if command matches any deploy pattern
  var matched = false;
  for (var i = 0; i < DEPLOY_PATTERNS.length; i++) {
    if (DEPLOY_PATTERNS[i].test(cmd)) {
      matched = true;
      break;
    }
  }
  if (!matched) return null;

  // Check git status for uncommitted changes
  var status = "";
  try {
    status = cp.execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf-8", timeout: 5000, windowsHide: true
    }).trim();
  } catch(e) {
    // Not a git repo or git not available — allow
    return null;
  }

  if (!status) return null; // Clean tree — allow deploy

  // Count changed files
  var changedFiles = status.split("\n").length;
  return {
    decision: "block",
    reason: "DEPLOY GATE: " + changedFiles + " uncommitted change(s) detected. " +
      "Commit before deploying so results are tied to a known git SHA.\n" +
      "Run: git add <files> && git commit -m 'describe what changed and why'\n" +
      "Changed files:\n" + status.split("\n").slice(0, 10).join("\n") +
      (changedFiles > 10 ? "\n... and " + (changedFiles - 10) + " more" : "")
  };
};
