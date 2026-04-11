// WORKFLOW: shtd
// WHY: Claude dives into coding without documenting what it's fixing or why.
// After context resets, there's no trail of intent. Forces a spec (TODO entry
// or recent commit message) before the first file modification.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var os = require("os");

var STATE_FILE = path.join(os.homedir(), ".claude", "hooks", ".spec-before-code-state");

// File-modifying Bash patterns (shared with commit-counter-gate)
var FILE_MODIFY_PATTERNS = [
  /\bsed\s+-i/,
  /\bawk\s+-i/,
  /\becho\s+.*>/,
  /\bcat\s+.*>/,
  /\btee\s/,
  /\bpython[23]?\s+.*open\s*\(.*['"]\s*w/,
  /\bprintf\s+.*>/
];

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch(e) { return { lastCommitTs: 0, specChecked: false }; }
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch(e) {}
}

function hasRecentSpec() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return true; // Can't check — don't block

  // Check TODO.md for recent entries with task markers
  var todoPath = path.join(projectDir, "TODO.md");
  try {
    if (fs.existsSync(todoPath)) {
      var content = fs.readFileSync(todoPath, "utf-8");
      // Has unchecked tasks = spec exists
      if (/^- \[ \] T\d+:/m.test(content)) return true;
    }
  } catch(e) {}

  // Check recent commit message (within 5 min) with sufficient detail
  try {
    var log = cp.execFileSync("git", ["log", "--oneline", "-1", "--format=%s", "--since=5.minutes.ago"], {
      encoding: "utf-8", timeout: 5000, windowsHide: true
    }).trim();
    if (log && log.split(/\s+/).length > 4) return true;
  } catch(e) {}

  return false;
}

module.exports = function(input) {
  var cmd = "";
  if (input.tool_name === "Bash") {
    try {
      cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
    } catch(e) { cmd = (input.tool_input || {}).command || ""; }
  }

  // Reset state on git commit
  if (input.tool_name === "Bash" && /git\s+commit/.test(cmd)) {
    writeState({ lastCommitTs: Date.now(), specChecked: false });
    return null;
  }

  // Only check on file modifications
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

  var state = readState();

  // Already checked spec this commit cycle — don't nag
  if (state.specChecked) return null;

  // First file modification since last commit — check for spec
  if (hasRecentSpec()) {
    state.specChecked = true;
    writeState(state);
    return null;
  }

  // No spec found — block
  return {
    decision: "block",
    reason: "SPEC-BEFORE-CODE: No spec found for this change.\n" +
      "Before coding, document what you're doing:\n" +
      "  Option A: Add a task to TODO.md: '- [ ] T###: Fix <what> — <why>'\n" +
      "  Option B: The previous commit message (within 5 min) describes the work\n" +
      "Write the spec first, then make your changes."
  };
};
