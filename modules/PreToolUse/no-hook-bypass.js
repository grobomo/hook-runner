// WORKFLOW: shtd, starter
// WHY: Claude circumvented a PreToolUse gate by using Bash (cat >, echo >) instead
// of the blocked Write/Edit tool. This defeats the entire hook enforcement system.
// If a gate blocks Write/Edit, Bash must not be used as a backdoor to write the same file.
//
// Detection: When a Bash command writes to a file (cat >, echo >, tee, printf >),
// check if any PreToolUse gate would have blocked the equivalent Write/Edit.
// Also detects Claude explicitly saying "bypass" or "work around" a hook in its reasoning.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var FLAG_FILE = path.join(os.tmpdir(), ".claude-instruction-pending");

// Patterns that indicate Bash is being used to write files
var WRITE_PATTERNS = [
  /\bcat\s*>\s*/,
  /\bcat\s*>>\s*/,
  /\becho\s.*>\s*/,
  /\bprintf\s.*>\s*/,
  /\btee\s+/,
  /\bcat\s*<<.*>\s*/,       // heredoc redirect
  /\bcat\s*<<'?\w+'?\s*>/,  // heredoc with quote
];

// Extract the target file path from a write command
function extractTargetPath(cmd) {
  // Match: cat > "path" or cat > path or echo "x" > path or tee path
  var m = cmd.match(/>\s*"([^"]+)"/);
  if (m) return m[1];
  m = cmd.match(/>\s*'([^']+)'/);
  if (m) return m[1];
  m = cmd.match(/>\s*(\S+)/);
  if (m) return m[1];
  m = cmd.match(/\btee\s+"([^"]+)"/);
  if (m) return m[1];
  m = cmd.match(/\btee\s+(\S+)/);
  if (m) return m[1];
  return null;
}

// Paths that hook gates protect (same as instruction-to-hook-gate checks)
var HOOK_RULE_PATHS = [
  /run-modules[/\\]/,
  /\.claude[/\\]rules[/\\]/,
  /\.claude[/\\]hooks[/\\]/,
  /settings\.json$/,
  /settings\.local\.json$/,
  /CLAUDE\.md$/,
  /specs[/\\]/,
];

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    var ti = typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {};
    cmd = ti.command || "";
  } catch(e) {
    return null;
  }
  if (!cmd) return null;

  // Check if this Bash command writes to a file
  var isWriteCmd = false;
  for (var i = 0; i < WRITE_PATTERNS.length; i++) {
    if (WRITE_PATTERNS[i].test(cmd)) {
      isWriteCmd = true;
      break;
    }
  }
  if (!isWriteCmd) return null;

  // Check if instruction-to-hook flag is active
  // If so, this Bash write is bypassing the instruction-to-hook gate
  var flagActive = false;
  try {
    var flagData = fs.readFileSync(FLAG_FILE, "utf-8");
    if (flagData) flagActive = true;
  } catch(e) {}

  if (flagActive) {
    var targetPath = extractTargetPath(cmd);
    // Allow if writing to hook/rule paths (that's the desired action)
    if (targetPath) {
      for (var j = 0; j < HOOK_RULE_PATHS.length; j++) {
        if (HOOK_RULE_PATHS[j].test(targetPath)) return null;
      }
    }

    return {
      decision: "block",
      reason: "HOOK BYPASS BLOCKED: A PreToolUse gate (instruction-to-hook) is active " +
        "but you're using Bash to write a file instead of using the Write/Edit tool.\n\n" +
        "This is not allowed. Bash must not be used to circumvent hook enforcement.\n" +
        "FIX: Address the gate's requirement first (create the hook/rule it asks for), " +
        "then use Write/Edit for the original file.\n" +
        "If the gate fired incorrectly, fix the gate — don't bypass it."
    };
  }

  // Check if the Bash description mentions bypassing
  var desc = "";
  try {
    var ti2 = typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {};
    desc = ti2.description || "";
  } catch(e) {}

  var bypassPatterns = [
    /bypass/i,
    /work\s*around/i,
    /circumvent/i,
    /avoid.*hook/i,
    /dodge.*gate/i,
    /skip.*check/i,
  ];
  for (var k = 0; k < bypassPatterns.length; k++) {
    if (bypassPatterns[k].test(desc) || bypassPatterns[k].test(cmd)) {
      return {
        decision: "block",
        reason: "HOOK BYPASS BLOCKED: Your description or command mentions bypassing a hook.\n\n" +
          "If a hook is wrong, fix the hook. If a hook is right, follow it.\n" +
          "Never use Bash as a backdoor around Write/Edit enforcement."
      };
    }
  }

  return null;
};
