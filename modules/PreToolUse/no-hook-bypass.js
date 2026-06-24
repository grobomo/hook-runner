// TOOLS: Bash
// WORKFLOW: shtd, starter, haiku-rules
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
  // Handle >> (append) before > to avoid capturing second > as path
  var m = cmd.match(/>>\s*"([^"]+)"/);
  if (m) return m[1];
  m = cmd.match(/>>\s*'([^']+)'/);
  if (m) return m[1];
  m = cmd.match(/>>\s*(\S+)/);
  if (m) return m[1];
  m = cmd.match(/[^>]>\s*"([^"]+)"/);
  if (m) return m[1];
  m = cmd.match(/[^>]>\s*'([^']+)'/);
  if (m) return m[1];
  m = cmd.match(/[^>]>\s*(\S+)/);
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
      reason: "BLOCKED: Bash file write operation while instruction-to-hook gate is active\nWHY: This prevents circumventing PreToolUse gates by using shell redirection operators (cat >, echo >) to write files instead of calling the intended hook\nNEXT STEPS:\n1. Use the proper hook-enabled method for file operations instead of shell redirection\n2. Contact your administrator if you need to modify the gate configuration\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-hook-bypass — {describe the issue}\""
    };
  }

  // Whitelist: writing to TODO.md or documentation is always allowed
  if (/(?:TODO|CHANGELOG|TODO-COMPLETED)\.md/i.test(cmd)) return null;

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
        reason: "BLOCKED: Attempt to use shell redirection operators to bypass PreToolUse hook restrictions\nWHY: Claude previously circumvented gate validation by using cat > and echo > instead of direct API calls\nNEXT STEPS:\n1. Use the intended tool or API method directly without shell redirection\n2. Contact your administrator if you need access to a restricted operation\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-hook-bypass — {describe the issue}\""
      };
    }
  }

  return null;
};
