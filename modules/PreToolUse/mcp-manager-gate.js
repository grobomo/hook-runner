// TOOLS: Bash, Edit, Write
// WORKFLOW: wsl, starter
// WHY: Claude added MCP server entries directly to .mcp.json instead of using
// mcp-manager. Direct entries bypass lifecycle management (auto-start, idle
// timeout, restart) and create orphaned server processes. Also blocks manual
// MCP relay script invocations that should go through mcp-manager.
//
// Rule: Only mcp-manager belongs in .mcp.json. All other servers are managed
// through mcp-manager's servers.yaml configuration.
//
// INCIDENT HISTORY:
//   2026-04-15: Claude added blueprint-extra-mcp directly to .mcp.json,
//   bypassing mcp-manager. Server didn't auto-stop, consumed memory for hours.
//   2026-04-28: Claude ran npx @modelcontextprotocol/server-filesystem directly
//   instead of routing through mcp-manager. Process leaked after session ended.
"use strict";
var path = require("path");
var fs = require("fs");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "mcp-manager-gate";
  entry.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf-8"); } catch (e) {}
}

var MCP_JSON_PATTERN = /\.mcp\.json$/;
var MCPM_NAMES = /mcp[-_]?manager/i;

var RELAY_PATTERNS = [
  /npx\s+@modelcontextprotocol\//,
  /npx\s+mcp-server-/,
  /node\s+.*mcp.*relay/i,
  /node\s+.*mcp.*server/i,
  /python3?\s+.*mcp.*server/i
];

module.exports = function(input) {
  var toolInput = input.tool_input || {};
  if (typeof toolInput === "string") {
    try { toolInput = JSON.parse(toolInput); } catch(e) { toolInput = {}; }
  }

  if (input.tool_name === "Edit" || input.tool_name === "Write") {
    var filePath = (toolInput.file_path || "").replace(/\\/g, "/");
    if (!MCP_JSON_PATTERN.test(filePath)) return null;

    var content = toolInput.content || toolInput.new_string || "";
    if (!content) return null;

    if (MCPM_NAMES.test(content)) {
      log({ result: "pass", reason: "mcp-manager entry" });
      return null;
    }

    if (/"command"\s*:/.test(content) || /"args"\s*:\s*\[/.test(content) || /"url"\s*:/.test(content)) {
      log({ result: "block", reason: "direct MCP server in .mcp.json", file: filePath });
      return {
        decision: "block",
        reason: "MCP-MANAGER: Do not add MCP servers directly to .mcp.json.\n" +
          "Only mcp-manager belongs in .mcp.json.\n\n" +
          "To add an MCP server:\n" +
          "  1. Add it to servers.yaml (mcp-manager config)\n" +
          "  2. Use: mcpm call mcp-manager add server=<name> command=<cmd>\n" +
          "  3. Or edit servers.yaml directly and run: mcpm call mcp-manager reload\n\n" +
          "mcp-manager handles: auto-start, idle timeout, restart, tool proxying."
      };
    }
  }

  if (input.tool_name === "Bash") {
    var cmd = (toolInput.command || "");

    for (var i = 0; i < RELAY_PATTERNS.length; i++) {
      if (RELAY_PATTERNS[i].test(cmd)) {
        log({ result: "block", reason: "direct MCP server invocation", cmd: cmd.substring(0, 80) });
        return {
          decision: "block",
          reason: "MCP-MANAGER: Do not start MCP servers directly.\n" +
            "Detected: " + cmd.substring(0, 80) + "\n\n" +
            "Use mcp-manager instead:\n" +
            "  mcpm call mcp-manager start server=<name>\n" +
            "  mcpm call mcp-manager call server=<name> tool=<tool> arguments='{...}'\n\n" +
            "mcp-manager handles lifecycle, auto-stop, and tool proxying."
        };
      }
    }
  }

  return null;
};
