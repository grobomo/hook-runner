// TOOLS: Edit, Write, Bash
// WORKFLOW: shtd, starter, haiku-rules
// WHY: User has instructed across 3+ sessions to never use Claude's native
// rules/memory system (.claude/rules/, MEMORY.md, auto-memory). All enforcement
// must use hook-runner modules (gates). Native rules are invisible, unenforceable,
// and forgotten across context resets.
// T732: Extended to cover Bash file mutations (echo >, cat heredoc, tee, cp, etc.)
// T773: Extended to cover MEMORY.md and all native Claude memory files.
//
// INCIDENT HISTORY:
// 2026-04: Claude kept creating .claude/rules/ files despite being told not to (3x).
// 2026-06: Philosophy documented: Gates > Rules > Memory. See hook-runner CLAUDE.md.
"use strict";
var path = require("path");
var os = require("os");
var bashHelper = require(path.join(__dirname, "_bash-write-patterns.js"));

var homeDir = os.homedir().replace(/\\/g, "/");
var globalRules = homeDir + "/.claude/rules";

var BLOCK_MSG = "BLOCKED: Write to Claude native rules/memory file.\n" +
  "WHY: Native rules and memory files are the WEAKEST enforcement tier — they do not survive context resets " +
  "and Claude can rationalize past them. All behavioral enforcement must use hook-runner gates (mechanical, " +
  "cannot bypass). See: hook-runner CLAUDE.md 'Enforcement Philosophy: Gates > Rules > Memory'.\n" +
  "NEXT STEPS:\n" +
  "1. Read hook-runner CLAUDE.md (find it via: find ~ -path '*/hook-runner/CLAUDE.md' -maxdepth 6 2>/dev/null)\n" +
  "2. Create a hook-runner gate module in modules/PreToolUse/ instead\n" +
  "3. Install with: node setup.js --sync\n" +
  "FALSE POSITIVE? File a TODO in hook-runner: \"Fix no-native-memory-gate — {describe the issue}\"";

// Check if path targets a native Claude rules/memory file
function isNativeEnforcementPath(normalized) {
  // .claude/rules/ (global or project)
  if (normalized.indexOf(globalRules) === 0) return "~/.claude/rules/";
  if (normalized.indexOf(".claude/rules") !== -1 && normalized.indexOf("/rules/") !== -1) return ".claude/rules/";
  // MEMORY.md (Claude's native auto-memory)
  if (/\/MEMORY\.md$/.test(normalized)) return "MEMORY.md";
  // .claude/memory/ directory (auto-memory storage)
  if (normalized.indexOf(".claude/memory/") !== -1 || normalized.indexOf("/.claude/memory") !== -1) return ".claude/memory/";
  return null;
}

module.exports = function(input) {
  var tool = input.tool_name;

  // T732: Bash file mutations
  if (tool === "Bash") {
    var cmd = (input.tool_input || {}).command || "";
    if (!cmd) return null;
    var parsed = bashHelper.parseBashWrite(cmd);
    if (!parsed) return null;
    var bashNorm = (parsed.targetPath || "").replace(/\\/g, "/");
    if (isNativeEnforcementPath(bashNorm)) {
      return { decision: "block", reason: BLOCK_MSG };
    }
    return null;
  }

  if (tool !== "Write" && tool !== "Edit") return null;

  var filePath = "";
  if (input.tool_input) {
    filePath = input.tool_input.file_path || input.tool_input.path || "";
  }
  if (!filePath) return null;

  var normalized = filePath.replace(/\\/g, "/");
  if (isNativeEnforcementPath(normalized)) {
    return { decision: "block", reason: BLOCK_MSG };
  }

  return null;
};
