// TOOLS: Bash, Read
// WORKFLOW: haiku-rules
// WHY: Multiple projects implement their own JSONL transcript parsers, each
//      with different bugs (missing tool_use, wrong role detection, no hook
//      parsing). One shared module exists: haiku-client.getConversationContext().
//      All transcript reading must go through it.
//
// INCIDENT HISTORY:
//   2026-05-20: 5+ projects had divergent transcript parsers. auto-continue-gate
//   had its own inline reader that missed tool calls. Haiku couldn't see what Opus
//   actually did — only what Opus claimed in text.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function _log(obj) {
  obj.ts = new Date().toISOString();
  obj.module = "transcript-shared-reader-gate";
  obj.event = "PreToolUse";
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(obj) + "\n"); } catch (e) {}
}

var LOGS_DIR_PATTERN = /\.claude\/projects\/[^/]+\/[^/]+\.jsonl/;
var LOGS_DIR_PATTERN2 = /\.claude[\/\\]projects[\/\\]/;

module.exports = function(input) {
  var tool = input.tool_name;

  if (tool === "Read") {
    var filePath = ((input.tool_input || {}).file_path || "");
    if (LOGS_DIR_PATTERN.test(filePath) || (LOGS_DIR_PATTERN2.test(filePath) && filePath.endsWith(".jsonl"))) {
      _log({ result: "block", file: filePath.split("/").pop() });
      return {
        decision: "block",
        reason: "BLOCKED: Direct read of transcript JSONL file\nWHY: Multiple projects implemented duplicate JSONL transcript parsers, creating maintenance burden and inconsistent behavior across codebases\nNEXT STEPS:\n1. Use the shared transcript reader utility from the common library\n2. If the utility does not support your use case, file a feature request to extend it\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix transcript-shared-reader-gate — {describe the issue}\""
      };
    }
    return null;
  }

  if (tool === "Bash") {
    var cmd = ((input.tool_input || {}).command || "");
    if (/\.claude\/projects\/.*\.jsonl/.test(cmd) && /\b(cat|head|tail|grep|python|node)\b/.test(cmd)) {
      if (/haiku-client|getConversationContext/.test(cmd)) return null;
      if (/wc\s+-l|ls\s/.test(cmd)) return null;
      _log({ result: "block", cmd: cmd.slice(0, 80) });
      return {
        decision: "block",
        reason: "BLOCKED: Ad-hoc Bash parsing of transcript JSONL\nWHY: Multiple projects implement duplicate JSONL transcript parsers, creating maintenance burden and inconsistent behavior across codebases\nNEXT STEPS:\n1. Use the shared transcript-reader utility from the common library\n2. Remove local parsing logic and import the standardized parser instead\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix transcript-shared-reader-gate — {describe the issue}\""
      };
    }
    return null;
  }

  return null;
};
