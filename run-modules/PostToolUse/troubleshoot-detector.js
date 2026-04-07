// WORKFLOW: shtd
// WHY: Claude tried 3 wrong ways to call claude -p before finding the right
// pattern in an existing project. The troubleshooting cycle wasted time and
// the lesson was almost lost. This module detects "fail-fail-succeed" patterns
// on Bash commands and prompts Claude to create a hook module so the solution
// is enforced permanently — not just remembered for this session.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

// T337: Include parent PID in filename for session isolation across tabs
var STATE_FILE = path.join(os.tmpdir(), ".claude-bash-failures-" + process.ppid + ".json");
var FAIL_THRESHOLD = 2; // consecutive failures before a success triggers the prompt

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (e) {
    return { failures: [], lastPrompted: 0 };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (e) {}
}

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";
  var exitCode = -1;

  // Extract exit code from tool output
  var output = (input.tool_output || input.output || "").toString();
  if (/Exit code (\d+)/.test(output)) {
    exitCode = parseInt(RegExp.$1);
  } else if (output.indexOf("Exit code") === -1 && output.indexOf("error") === -1) {
    exitCode = 0; // assume success if no error indicators
  }

  var state = loadState();

  if (exitCode !== 0) {
    // Record failure
    state.failures.push({
      ts: Date.now(),
      cmd: cmd.substring(0, 200)
    });
    // Keep only recent failures (last 5 min)
    var cutoff = Date.now() - 300000;
    state.failures = state.failures.filter(function(f) { return f.ts > cutoff; });
    saveState(state);
    return null;
  }

  // Success — check if preceded by enough failures
  var recentFailures = state.failures.length;
  if (recentFailures < FAIL_THRESHOLD) {
    // Not enough failures — clear and move on
    state.failures = [];
    saveState(state);
    return null;
  }

  // Cooldown: don't prompt more than once per 5 minutes
  if (Date.now() - state.lastPrompted < 300000) {
    state.failures = [];
    saveState(state);
    return null;
  }

  // Troubleshooting cycle detected!
  var failedCmds = state.failures.map(function(f) { return f.cmd; }).join("\n  ");
  state.failures = [];
  state.lastPrompted = Date.now();
  saveState(state);

  return { decision: "block", reason: "TROUBLESHOOTING CYCLE DETECTED: " + recentFailures + " failed attempts before success.\n" +
    "Failed commands:\n  " + failedCmds + "\n" +
    "Successful command: " + cmd.substring(0, 200) + "\n\n" +
    "You just learned something the hard way. To prevent repeating this:\n" +
    "1) Create a PreToolUse hook module that catches the bad pattern and suggests the good one\n" +
    "2) Commit it to hook-runner so it persists across sessions\n" +
    "3) If this pattern exists in another project already, you should have checked there FIRST\n\n" +
    "Do this NOW before moving on." };
};
