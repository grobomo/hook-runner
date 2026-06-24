// TOOLS: mcp__mcp-manager__mcpm
// WORKFLOW: haiku-rules
// WHY: Cost validation requires a live portal check. Without evidence tracking,
//      Claude can mark cost tasks "validated" using stale cached data from prior
//      sessions without ever opening the RONE portal.
//
// INCIDENT HISTORY:
//   2026-05-19: Claude marked T205d "validated" using $200 estimate from a
//   previous session without opening the portal. The $0.66/M rate was built
//   on that unverified estimate.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var EVIDENCE_PATH = process.env.PORTAL_EVIDENCE_PATH || "/tmp/.hook-runner-portal-evidence.json";
var TTL_MS = 30 * 60 * 1000;

function _log(obj) {
  obj.ts = new Date().toISOString();
  obj.module = "portal-evidence-recorder-gate";
  obj.event = "PostToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n"); } catch (e) {}
}

var PORTAL_URLS = [
  /portal\.rdsec\.trendmicro\.com/i,
  /portal-stg\.rdsec\.trendmicro\.com/i,
];

function isPortalUrl(url) {
  if (!url) return false;
  for (var i = 0; i < PORTAL_URLS.length; i++) {
    if (PORTAL_URLS[i].test(url)) return true;
  }
  return false;
}

module.exports = function(input) {
  var tool = input.tool_name || "";
  if (tool !== "mcp__mcp-manager__mcpm") return null;

  var toolInput = input.tool_input || {};
  var args = toolInput.arguments || {};
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch (e) { args = {}; }
  }

  var mcpTool = toolInput.tool || "";
  if (mcpTool !== "browser_navigate" && mcpTool !== "browser_tabs") return null;

  var url = args.url || args.target_url || "";
  if (mcpTool === "browser_tabs") {
    var action = args.action || "";
    if (action !== "navigate") return null;
    url = args.url || "";
  }

  if (!isPortalUrl(url)) {
    var result = input.tool_result || input.result || "";
    if (typeof result === "object") result = JSON.stringify(result);
    if (!isPortalUrl(result)) return null;
  }

  var evidence = {
    ts: new Date().toISOString(),
    url: url.slice(0, 200),
    session_id: (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8),
    tool: mcpTool
  };

  try {
    var existing = [];
    try {
      var raw = fs.readFileSync(EVIDENCE_PATH, "utf-8");
      existing = JSON.parse(raw);
      if (!Array.isArray(existing)) existing = [existing];
    } catch (e) { existing = []; }

    var now = Date.now();
    existing = existing.filter(function(e) {
      return e.ts && (now - new Date(e.ts).getTime()) < TTL_MS;
    });
    existing.push(evidence);

    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(existing, null, 2), "utf-8");
    _log({ result: "recorded", url: url.slice(0, 80) });
  } catch (e) {
    _log({ result: "error", reason: e.message });
  }

  return null;
};
