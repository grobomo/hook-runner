// WORKFLOW: shtd
// WHY: In ddei-email-security, Claude ran 289 az vm run-commands and tried 8
// different approaches over 51 sessions without tracking failures. No throttle
// on infra commands meant unlimited retries with no reflection checkpoint.
// This gate counts infra commands per session and blocks when thresholds are
// exceeded, forcing HYPOTHESIS.md updates before continuing.

var fs = require("fs");
var path = require("path");

// Infra command patterns — az, ssh, scp, terraform
var INFRA_RE = /\b(az\s+(vm|network|storage|group|role)|ssh\s|scp\s|terraform\s)/;

// Thresholds
var MAX_INFRA = 8;       // enough for 6-step hypothesis + 2 retries
var MAX_FAILURES = 2;    // two strikes = rethink
var REMINDER_INTERVAL = 5; // re-prompt every 5 commands past threshold

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (projectDir.indexOf("ddei-email-security") === -1) return null;

  var command = (input.tool_input || {}).command || "";
  if (!INFRA_RE.test(command)) return null;

  // State file in project .claude dir
  var stateDir = path.join(projectDir, ".claude");
  var stateFile = path.join(stateDir, "hypothesis-state.json");

  // Read or init state
  var state = { session_id: "", infra_commands: 0, failures: 0, last_hypothesis_mtime: 0 };
  try {
    state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
  } catch (e) { /* first run or corrupt — use defaults */ }

  // Reset on new session
  var sessionId = process.env.CLAUDE_SESSION_ID || "";
  if (sessionId && state.session_id !== sessionId) {
    state.session_id = sessionId;
    state.infra_commands = 0;
    state.failures = 0;
    state.last_hypothesis_mtime = 0;
  }

  // Check if HYPOTHESIS.md was updated (resets failure counter only)
  var hypothesisFile = path.join(projectDir, "HYPOTHESIS.md");
  try {
    var hStat = fs.statSync(hypothesisFile);
    var hMtime = hStat.mtimeMs;
    if (state.last_hypothesis_mtime && hMtime > state.last_hypothesis_mtime) {
      state.failures = 0; // hypothesis updated — reset failures
    }
    state.last_hypothesis_mtime = hMtime;
  } catch (e) {
    // No HYPOTHESIS.md — that's fine, failures won't reset
  }

  // Increment infra command count
  state.infra_commands++;

  // Write state before checking thresholds (count must persist even if we block)
  try {
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (e) { /* best effort */ }

  // CHECK 1: Too many failures — must update HYPOTHESIS.md
  if (state.failures >= MAX_FAILURES) {
    return {
      decision: "block",
      reason: "HYPOTHESIS CHECK: " + state.failures + " infra command failures this session.\n" +
        "Update HYPOTHESIS.md 'Failed Approaches' section before continuing.\n" +
        "Document: what you tried, what failed, why it failed, what to try next.\n" +
        "File: " + hypothesisFile
    };
  }

  // CHECK 2: Too many infra commands
  if (state.infra_commands > MAX_INFRA) {
    // Check branch status
    var branch = (input._git && input._git.branch) || "";
    var isMainBranch = !branch || branch === "main" || branch === "master";

    if (isMainBranch) {
      return {
        decision: "block",
        reason: "HYPOTHESIS CHECK: " + state.infra_commands + " infra commands on " +
          (branch || "main") + " (limit: " + MAX_INFRA + ").\n" +
          "Create a feature branch + PR to track this work before continuing.\n" +
          "Run: git checkout -b <descriptive-branch-name>"
      };
    }

    // On feature branch — remind every N commands past threshold
    var pastThreshold = state.infra_commands - MAX_INFRA;
    if (pastThreshold % REMINDER_INTERVAL === 0) {
      return {
        decision: "block",
        reason: "HYPOTHESIS CHECK: " + state.infra_commands + " infra commands this session " +
          "(threshold: " + MAX_INFRA + ").\n" +
          "Are you spinning wheels? Update HYPOTHESIS.md before continuing.\n" +
          "Document your current approach and what you've learned so far.\n" +
          "File: " + hypothesisFile
      };
    }
  }

  return null;
};
