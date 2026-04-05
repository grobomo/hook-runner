// WORKFLOW: shtd
// WHY: User instructions ("always X") were forgotten next session. Must become hooks or SHTD workflows.
"use strict";
// PreToolUse: enforce that user instructions ("always X", "never Y") become hooks/rules.
// Works with UserPromptSubmit/instruction-detector.js which sets a flag file.
//
// When a flag is set (user gave a persistent instruction), this gate:
// - ALLOWS edits to hook files (run-modules/, .claude/rules/, settings.json)
// - ALLOWS reading/searching (Grep, Glob, Read)
// - BLOCKS other edits until a hook or rule has been created
//
// The flag is cleared when:
// - A hook/rule file is successfully written (PostToolUse would do this, but
//   for simplicity we clear it when we see an Edit/Write targeting a hook path)
// - The next user message doesn't contain instruction keywords (detector clears it)
var fs = require("fs");
var path = require("path");
var os = require("os");

var FLAG_FILE = path.join(os.tmpdir(), ".claude-instruction-pending");

// Paths that count as "creating a hook or rule"
var HOOK_RULE_PATHS = [
  /run-modules[/\\]/,
  /\.claude[/\\]rules[/\\]/,
  /\.claude[/\\]hooks[/\\]/,
  /settings\.json$/,
  /settings\.local\.json$/,
  /CLAUDE\.md$/,
];

module.exports = function(input) {
  // Only gate Edit and Write tools
  if (input.tool_name !== "Edit" && input.tool_name !== "Write") return null;

  // Check if instruction flag is set
  var flagData;
  try {
    flagData = fs.readFileSync(FLAG_FILE, "utf-8");
  } catch(e) {
    return null; // No flag = no enforcement
  }

  if (!flagData) return null;

  // Get the target file path
  var filePath = "";
  try {
    var ti = typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {};
    filePath = ti.file_path || "";
  } catch(e) {
    return null;
  }

  // If editing a hook/rule file, allow (this IS the enforcement action)
  for (var i = 0; i < HOOK_RULE_PATHS.length; i++) {
    if (HOOK_RULE_PATHS[i].test(filePath)) {
      // Clear the flag — the instruction is being codified
      try { fs.unlinkSync(FLAG_FILE); } catch(e) {}
      return null; // allow
    }
  }

  // Also allow spec files and test scripts (they document work, not instructions)
  if (/specs[/\\]/.test(filePath) || /scripts[/\\]test[/\\]/.test(filePath)) {
    return null;
  }

  // Block — user gave an instruction but Claude is editing non-hook code
  var flag;
  try { flag = JSON.parse(flagData); } catch(e) { flag = {}; }

  return {
    decision: "block",
    reason: "INSTRUCTION-TO-HOOK GATE: User gave a persistent instruction " +
      "(detected: " + (flag.pattern || "instruction keyword") + ") but you're editing " +
      "'" + path.basename(filePath) + "' instead of creating a hook or rule.\n\n" +
      "User said: \"" + (flag.preview || "").substring(0, 100) + "...\"\n\n" +
      "FIX: Create a hook in ~/.claude/hooks/run-modules/<Event>/ or an SHTD workflow.\n" +
      "Then the flag will clear and you can proceed with other edits.\n" +
      "If the instruction is already covered by an existing hook/workflow, edit that file to acknowledge it.\n" +
      "NOTE: .claude/rules/ is deprecated — use hooks/run-modules or SHTD workflows instead."
  };
};
