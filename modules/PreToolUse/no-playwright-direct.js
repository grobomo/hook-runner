// WORKFLOW: shtd, starter, gsd
// WHY: Claude ignored CLAUDE.md instructions to never use Playwright directly and called
// mcp__playwright__* tools instead of Blueprint Extra MCP via mcp-manager. Blueprint wraps
// Playwright with session management, tab lifecycle, and SSO handling that raw Playwright lacks.
"use strict";

module.exports = function(input) {
  var tool = input.tool_name || "";

  if (tool.indexOf("mcp__playwright__") === 0) {
    return {
      decision: "block",
      reason: "BLOCKED: Direct Playwright MCP tool call attempted\nWHY: Claude ignored CLAUDE.md instructions and attempted to use Playwright directly instead of delegating to the appropriate wrapper tool\nNEXT STEPS:\n1. Review CLAUDE.md for the correct tool to use for browser automation\n2. Call the designated wrapper tool instead of invoking Playwright MCP directly\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-playwright-direct — {describe the issue}\""
    };
  }

  return null;
};
