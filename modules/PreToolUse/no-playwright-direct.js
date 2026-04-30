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
      reason: "BLOCKED: Do not use Playwright MCP tools directly.\n" +
        "Tool: " + tool + "\n" +
        "FIX: Use Blueprint Extra MCP via mcp-manager instead.\n" +
        "Blueprint provides session management, tab lifecycle, and SSO handling.\n" +
        "Example: mcp__mcp-manager__mcpm (then use blueprint-extra tools)"
    };
  }

  return null;
};
