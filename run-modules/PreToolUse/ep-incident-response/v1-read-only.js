// WORKFLOW: customer-data-guard
// WHY: EP incident response must NEVER modify the customer's V1 environment.
// This gate blocks any V1 API call that could write, update, or delete data.
// Read-only operations (GET) are allowed.
"use strict";

// V1 API write endpoints — block these HTTP methods/paths
var WRITE_PATTERNS = [
  // Skill tool calls to v1-api that could modify
  /v1[-_]?(api|lite).*\b(add|create|update|delete|patch|post|put|remove|block|isolate|quarantine|collect|reset|terminate|disable|enable|submit|run|execute|deploy|restore)\b/i,
  // Direct curl/fetch to V1 API with write methods
  /curl\b.*-X\s*(POST|PUT|PATCH|DELETE)\b.*api\.xdr\.trendmicro/i,
  /curl\b.*api\.xdr\.trendmicro.*-X\s*(POST|PUT|PATCH|DELETE)/i,
  // Python requests to V1 with write methods
  /requests\.(post|put|patch|delete)\s*\(.*api\.xdr\.trendmicro/i,
  // V1 response actions (isolate endpoint, collect file, etc.)
  /\/v3\.0\/response\//i,
  // V1 blocklist modifications
  /\/v3\.0\/threat.*blocklist/i,
  // V1 custom script execution
  /\/v3\.0\/eicar/i,
];

// Known safe V1 read operations
var SAFE_PATTERNS = [
  /\b(search|list|get|download|export|describe|check|status|health)\b/i,
  /curl\b.*-X\s*GET\b/i,
  /curl\b[^|]*api\.xdr\.trendmicro(?!.*-X)/i,  // curl without -X defaults to GET
  /requests\.get\s*\(/i,
];

module.exports = function(input) {
  var tool = input.tool_name;
  var cmd = "";

  if (tool === "Bash") {
    cmd = (input.tool_input || {}).command || "";
  } else if (tool === "Skill") {
    var skill = (input.tool_input || {}).skill || "";
    var args = (input.tool_input || {}).args || "";
    cmd = skill + " " + args;
  } else {
    return null;
  }

  // Check if this touches V1 API at all
  var touchesV1 = /v1[-_]?(api|lite)|api\.xdr\.trendmicro|vision\s*one/i.test(cmd);
  if (!touchesV1) return null;

  // Check against write patterns
  for (var i = 0; i < WRITE_PATTERNS.length; i++) {
    if (WRITE_PATTERNS[i].test(cmd)) {
      return {
        decision: "block",
        reason: "V1 READ-ONLY GATE: This command could MODIFY the customer's Vision One environment.\n" +
          "POLICY: EP incident response is strictly read-only. No writes, no response actions,\n" +
          "no blocklist changes, no endpoint isolation. Read and analyze only.\n" +
          "Matched: " + WRITE_PATTERNS[i].toString()
      };
    }
  }

  return null;
};
