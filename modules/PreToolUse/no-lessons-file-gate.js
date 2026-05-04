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
        reason: "NO-LESSONS-FILE: Writing to lessons.jsonl is blocked.\n" +
          "WHY: Text file lessons are never enforced. Claude ignores them next session.\n" +
          "Only hook modules (.js in run-modules/) actually prevent mistakes.\n\n" +
          "FIX: Create a hook module instead:\n" +
          "  1. Write a .js module in hook-runner/modules/PreToolUse/\n" +
          "  2. Add a test in scripts/test/\n" +
          "  3. The module blocks the bad pattern and suggests the fix\n\n" +
          "Blocked: " + path.basename(filePath)
      };
    }
  }

  if (tool === "Bash") {
    var cmd = (ti.command || "");
    // Block: echo/printf/cat/node writing to lessons.jsonl
    if (/lessons\.jsonl/i.test(cmd) && />>|>\s|appendFile|writeFile|tee\b/.test(cmd)) {
      return {
        decision: "block",
        reason: "NO-LESSONS-FILE: Writing to lessons.jsonl via Bash is blocked.\n" +
          "WHY: Text file lessons are never enforced. Claude ignores them next session.\n" +
          "Only hook modules (.js in run-modules/) actually prevent mistakes.\n\n" +
          "FIX: Create a hook module instead of writing a lesson.\n\n" +
          "Command was: " + cmd.substring(0, 120)
      };
    }
  }

  return null;
};
