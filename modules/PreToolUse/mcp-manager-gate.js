// TOOLS: Bash, Edit, Write
// WORKFLOW: haiku-rules, starter
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
        reason: "BLOCKED: Direct MCP server entry added to .mcp.json without using the MCP manager\nWHY: Manual edits to .mcp.json bypass validation and configuration management, causing inconsistent server states\nNEXT STEPS:\n1. Remove the manual entry from .mcp.json\n2. Use the MCP manager tool to add the server with proper validation\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix mcp-manager-gate — {describe the issue}\""
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
          reason: "BLOCKED: Direct modification of MCP server entries in .mcp.json configuration file\nWHY: Previous incident where MCP servers were added directly to .mcp.json instead of using the proper manager interface, causing configuration inconsistencies and deployment failures\nNEXT STEPS:\n1. Use the MCP manager tool to add or modify server entries through the proper API\n2. If manual editing is necessary, validate changes against the schema before applying\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix mcp-manager-gate — {describe the issue}\""
        };
      }
    }
  }

  return null;
};
