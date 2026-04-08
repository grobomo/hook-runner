// WORKFLOW: shtd
// WHY: Companion to hypothesis-throttle. Without tracking failures, Claude
// retried the same broken approach dozens of times. This module increments
// the failure counter in hypothesis-state.json when infra commands exit
// non-zero, so the throttle can enforce HYPOTHESIS.md updates after 2 failures.

var fs = require("fs");
var path = require("path");

// Same pattern as hypothesis-throttle — must stay in sync
var INFRA_RE = /\b(az\s+(vm|network|storage|group|role)|ssh\s|scp\s|terraform\s)/;

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (projectDir.indexOf("ddei-email-security") === -1) return null;

  var command = (input.tool_input || {}).command || "";
  if (!INFRA_RE.test(command)) return null;

  // PostToolUse has tool_result with exit_code
  var toolResult = input.tool_result || {};
  var exitCode = toolResult.exit_code;

  // Only track failures (non-zero exit)
  if (exitCode === 0 || exitCode === undefined || exitCode === null) return null;

  // Read state file
  var stateFile = path.join(projectDir, ".claude", "hypothesis-state.json");
  var state = { session_id: "", infra_commands: 0, failures: 0, last_hypothesis_mtime: 0 };
  try {
    state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
  } catch (e) { /* throttle creates this — if missing, init defaults */ }

  // Increment failures
  state.failures++;

  // Write back
  try {
    var stateDir = path.dirname(stateFile);
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (e) { /* best effort */ }

  // PostToolUse is monitoring — warn but don't block
  return null;
};
