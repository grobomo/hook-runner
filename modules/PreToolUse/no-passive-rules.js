// TOOLS: Write
// WORKFLOW: shtd, gsd
// WHY: Claude kept creating .md rule files in .claude/rules/ instead of active
// hook modules. Rule files are passive — Claude has to read and choose to follow
// them. Hook modules are active — they execute and block. Persistent lessons and
// enforcement belong in hooks, not rules.
//
// SCOPE: Blocks Write/Edit to .claude/rules/ (global or project) when creating
// NEW .md files. Editing existing rules is allowed (maintaining, not creating).
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Write") return null;

  var path = (input.tool_input || {}).file_path || "";
  var norm = path.replace(/\\/g, "/");

  // Only block creating NEW rule files in .claude/rules/
  // (not archive/, not editing existing files — Edit tool is fine)
  if (!/\.claude\/rules\/[^/]+\.md$/.test(norm)) return null;
  if (/\/archive\//.test(norm)) return null;

  // Allow project-specific rules in project .claude/rules/ — those are
  // checked into git and serve as project documentation. Only block
  // global rules (~/.claude/rules/) that should be hooks instead.
  // WHY: Only block global rules (~/.claude/rules/), not project-scoped ones.
  var home = (require("os").homedir() || "").replace(/\\/g, "/");
  if (!home || norm.indexOf(home + "/.claude/rules/") === -1) return null;

  return { decision: "block", reason: "BLOCKED: Creating passive .md rule file in ~/.claude/rules/.\n\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix no-passive-rules — {describe the issue}\"" +
    "WHY: Rule files are passive text that Claude can ignore — hook modules are active code that executes and enforces.\n" +
    "NEXT STEPS:\n" +
    "1. Create a hook module instead: ~/.claude/hooks/run-modules/PreToolUse/<name>-gate.js\n" +
    "2. If this is project-specific, put it in the project's .claude/rules/ (those are fine)\n" +
    "3. For global enforcement, only hook-runner modules work reliably" };
};
