// WORKFLOW: self-improvement
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

  return "BLOCKED: Don't create passive .md rule files in ~/.claude/rules/. " +
    "Persistent lessons must be ACTIVE hook modules in " +
    "~/.claude/hooks/run-modules/<Event>/*.js — they execute and enforce. " +
    "Rule files are passive and get ignored. " +
    "If this is a project-specific rule, put it in the project's .claude/rules/ instead.";
};
