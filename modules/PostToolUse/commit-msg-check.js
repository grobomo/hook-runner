// WORKFLOW: shtd, gsd
// TOOLS: Bash
// WHY: Sloppy commit messages made PR history unreadable.
// Commit message check: warns if git commit messages don't follow conventions
// PostToolUse module — runs after Bash tool completes
// Checks: starts with type prefix OR task ID, reasonable length, no WIP/fixup in final commits

module.exports = function(input) {
  var toolName = input.tool_name || "";
  if (toolName !== "Bash") return null;

  var command = (input.tool_input || {}).command || "";

  // Only check git commit commands
  if (!/\bgit\s+commit\b/.test(command)) return null;

  // Skip amend commits (they rewrite, different rules)
  if (/--amend/.test(command)) return null;

  // Extract the commit message from -m flag
  // Handles: git commit -m "msg", git commit -m 'msg', git commit -m "$(cat <<'EOF'\nmsg\nEOF\n)"
  var msg = null;

  // HEREDOC pattern: -m "$(cat <<'EOF' ... EOF )"
  var heredocMatch = command.match(/--?m\s+"?\$\(cat\s+<<'?EOF'?\s*\n([\s\S]*?)\n\s*EOF/);
  if (heredocMatch) {
    msg = heredocMatch[1].trim();
  }

  // Simple -m "msg" or -m 'msg'
  if (!msg) {
    var simpleMatch = command.match(/--?m\s+["']([^"']+)["']/);
    if (simpleMatch) msg = simpleMatch[1].trim();
  }

  if (!msg) return null; // Can't extract message, skip

  var warnings = [];
  var firstLine = msg.split("\n")[0];

  // Check for WIP/fixup/squash prefixes
  if (/^(wip|fixup!|squash!|tmp|temp)\b/i.test(firstLine)) {
    warnings.push("Commit message starts with '" + firstLine.split(/\s/)[0] + "' — not suitable for final commits");
  }

  // Check length (conventional: under 72 chars for first line)
  if (firstLine.length > 72) {
    warnings.push("First line is " + firstLine.length + " chars (convention: max 72)");
  }

  // Check it starts with a type prefix or task ID
  // Common types: feat, fix, docs, style, refactor, test, chore, build, ci, perf
  // Task IDs: T001, T055, etc.
  var hasType = /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.*?\))?[!:]/.test(firstLine);
  var hasTaskId = /^T\d{3}/i.test(firstLine);
  var hasPrefix = hasType || hasTaskId;

  if (!hasPrefix) {
    // This is a soft warning, not a block — many projects don't use conventional commits
    // Only warn, don't block
  }

  if (warnings.length > 0) {
    return {
      decision: "block",
      reason: "Commit message issues:\n" + warnings.map(function(w) { return "- " + w; }).join("\n")
    };
  }

  return null;
};
