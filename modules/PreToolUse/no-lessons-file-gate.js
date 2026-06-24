// TOOLS: Bash, Edit, Write
// WORKFLOW: shtd, gsd
// WHY: Claude writes "lessons learned" to lessons.jsonl files as text.
// These are never enforced — Claude ignores them next session. The user
// corrected this pattern repeatedly: "only hook modules work as enforcement,
// text lessons are useless". This gate blocks writes to lessons.jsonl and
// forces creating a hook module instead.
// T606: Block lessons.jsonl writes, force hook module creation.
"use strict";
var path = require("path");

module.exports = function(input) {
  var tool = input.tool_name;
  var ti = input.tool_input || {};

  if (tool === "Edit" || tool === "Write") {
    var filePath = (ti.file_path || "").replace(/\\/g, "/");
    if (/lessons\.jsonl$/i.test(filePath)) {
      return {
        decision: "block",
        reason: "BLOCKED: Writing to lessons.jsonl files\nWHY: Claude was persisting unstructured text as lessons learned data, causing malformed or incomplete entries in the lessons file.\nNEXT STEPS:\n1. Use a structured format (JSON objects) instead of plain text when writing lesson entries\n2. Validate lesson data before writing to ensure required fields are present\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-lessons-file-gate — {describe the issue}\""
      };
    }
  }

  if (tool === "Bash") {
    var cmd = (ti.command || "");
    // Block: echo/printf/cat/node writing to lessons.jsonl
    if (/lessons\.jsonl/i.test(cmd) && />>|>\s|appendFile|writeFile|tee\b/.test(cmd)) {
      return {
        decision: "block",
        reason: "BLOCKED: Writing to lessons.jsonl files via Bash commands\nWHY: Claude previously wrote lessons learned as unstructured text to lessons.jsonl, causing malformed JSONL records that broke downstream parsing.\nNEXT STEPS:\n1. Use the lessons API endpoint instead of direct file writes\n2. Ensure each lesson entry is valid JSON before persisting\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-lessons-file-gate — {describe the issue}\""
      };
    }
  }

  return null;
};
