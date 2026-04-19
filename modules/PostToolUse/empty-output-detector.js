// WORKFLOW: shtd, gsd
// TOOLS: Bash
// WHY: Claude treats empty command output as success — e.g., `ls screenshots/` returning
// nothing means no screenshots exist, but Claude proceeds as if they do. Empty output
// from directory listings, file checks, and query commands often means silent failure.
"use strict";

// Commands where empty output likely means a problem
var EXPECT_OUTPUT = [
  /^\s*ls\b/,
  /^\s*find\b/,
  /^\s*cat\b/,
  /^\s*node\s+.*--test/,
  /^\s*node\s+setup\.js\s+--/,
  /^\s*curl\b/,
  /^\s*az\s/,
  /^\s*kubectl\s+(get|describe|logs)\b/
];

// Commands where empty output is normal
var EMPTY_OK = [
  /^\s*(cp|mv|mkdir|rm|chmod|touch|cd)\b/,
  /^\s*git\s+(add|checkout|push|pull|fetch|merge)\b/,
  />/,           // redirects
  /2>&1\s*$/,    // stderr redirect at end (might be piped)
  /\|\s*wc\b/    // piped to wc (will have output)
];

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  // Check if output is empty/whitespace-only
  var output = (input.tool_result || "").toString().trim();
  if (output.length > 0) return null;

  // Skip commands where empty output is expected
  for (var e = 0; e < EMPTY_OK.length; e++) {
    if (EMPTY_OK[e].test(cmd)) return null;
  }

  // Check if this command normally produces output
  var expectsOutput = false;
  for (var i = 0; i < EXPECT_OUTPUT.length; i++) {
    if (EXPECT_OUTPUT[i].test(cmd)) { expectsOutput = true; break; }
  }

  if (!expectsOutput) return null;

  // Non-blocking advisory
  return {
    decision: "block",
    reason: "EMPTY OUTPUT from command that normally produces output.\n\n" +
      "Command: " + cmd.substring(0, 150) + "\n\n" +
      "This likely means:\n" +
      "  - Directory is empty (no files where expected)\n" +
      "  - File doesn't exist at that path\n" +
      "  - Query returned no results\n" +
      "  - Command failed silently\n\n" +
      "Investigate before proceeding. Do not assume empty = success."
  };
};
