// TOOLS: Bash, Edit, Write
// WORKFLOW: shtd, gsd
// WHY: Claude makes 20+ file changes without committing, then context resets
// and all work is lost or untraceable. User tracks progress via GitHub Mobile.
// Every 5 edits, force a commit so there's a git trail.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var os = require("os");

var COUNTER_FILE = path.join(os.homedir(), ".claude", "hooks", ".uncommitted-edit-count");
var MAX_EDITS = 5;

// Patterns indicating file-modifying Bash commands (shared helper — DRY with spec-before-code-gate)
var FILE_MODIFY_PATTERNS = require("./_file-modify-patterns");

function readCounter() {
  try {
    var data = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8"));
    return data.count || 0;
  } catch(e) { return 0; }
}

function writeCounter(count) {
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: count, ts: new Date().toISOString() }));
  } catch(e) {}
}

function getGitDiffCount() {
  try {
    var out = cp.execFileSync("git", ["diff", "--stat"], {
      encoding: "utf-8", timeout: 5000, windowsHide: true
    }).trim();
    if (!out) return 0;
    var lines = out.split("\n");
    // Last line is summary like "3 files changed, ..."
    var summary = lines[lines.length - 1];
    var match = summary.match(/(\d+)\s+file/);
    return match ? parseInt(match[1], 10) : 0;
  } catch(e) { return 0; }
}

module.exports = function(input) {
  var cmd = "";
  if (input.tool_name === "Bash") {
    try {
      cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
    } catch(e) { cmd = (input.tool_input || {}).command || ""; }
  }

  // Reset counter on git commit
  if (input.tool_name === "Bash" && /git\s+commit/.test(cmd)) {
    writeCounter(0);
    return null;
  }

  // Increment counter on file modifications
  var isFileModify = false;
  if (input.tool_name === "Edit" || input.tool_name === "Write") {
    isFileModify = true;
  } else if (input.tool_name === "Bash") {
    for (var i = 0; i < FILE_MODIFY_PATTERNS.length; i++) {
      if (FILE_MODIFY_PATTERNS[i].test(cmd)) {
        isFileModify = true;
        break;
      }
    }
  }

  if (!isFileModify) return null;

  var count = readCounter() + 1;
  writeCounter(count);

  if (count >= MAX_EDITS) {
    // Cross-check with actual git diff
    var gitCount = getGitDiffCount();
    if (gitCount === 0) {
      // Counter drifted (files were reverted) — reset
      writeCounter(0);
      return null;
    }
    return {
      decision: "block",
      reason: "COMMIT COUNTER: " + count + " file modifications since last commit (" + gitCount + " files changed in git).\n" +
        "Commit now with a descriptive message before continuing.\n" +
        "Run: git add <files> && git commit -m 'describe what changed and why'"
    };
  }

  return null;
};
