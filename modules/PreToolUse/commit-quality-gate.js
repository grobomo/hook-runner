// TOOLS: Bash
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Generic commit messages like "fix" or "update" make git history useless.
// When debugging E2E failures across 10+ deploy cycles, you need to know what
// each commit actually changed and why. Bad messages waste 10+ minutes per cycle.
"use strict";

var GENERIC_STARTS = /^\s*(fix|update|change|modify|edit|tweak|adjust|minor|wip|tmp|temp|stuff|misc|cleanup)\b/i;
var MIN_WORDS = 5;

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  // Only gate git commit commands
  if (!/git\s+commit/.test(cmd)) return null;

  // Skip amend (message already exists)
  if (/--amend/.test(cmd)) return null;

  // Extract commit message from -m flag
  var msg = "";
  // Try heredoc first: -m "$(cat <<'EOF'\nmsg\nEOF\n)"
  // Must check before simple -m "msg" because the outer quotes confuse the simple regex
  var heredocMatch = cmd.match(/\-m\s+"\$\(cat\s+<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (heredocMatch) {
    msg = heredocMatch[1].trim();
  } else {
    // Simple -m "msg" or -m 'msg'
    var mMatch = cmd.match(/\-m\s+["']([^"']+)["']/);
    if (mMatch) msg = mMatch[1].trim();
  }

  if (!msg) return null; // Can't parse message — don't block (might be interactive)

  // Check word count
  var words = msg.split(/\s+/).filter(function(w) { return w.length > 0; });
  if (words.length < MIN_WORDS) {
    return {
      decision: "block",
      reason: "BLOCKED: Commit message is too vague to be useful in git history\nWHY: Generic messages like \"fix\" or \"update\" make it impossible to understand what changed or why when reviewing history months later\nNEXT STEPS:\n1. Rewrite the commit message with specific details about what was changed and why\n2. Use the format: brief summary, blank line, then detailed explanation if needed\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix commit-quality-gate — {describe the issue}\""
    };
  }

  // Check for generic starts without specifics
  if (GENERIC_STARTS.test(msg) && words.length < 8) {
    return {
      decision: "block",
      reason: "BLOCKED: Commit message is too generic and does not describe the actual changes\nWHY: Vague commit messages like \"fix\" or \"update\" make git history unreadable and complicate debugging, blame tracking, and understanding why changes were made\nNEXT STEPS:\n1. Rewrite your commit message to describe what changed and why (e.g., \"Fix null pointer exception in user validation\" or \"Update database schema to support new fields\")\n2. Amend your commit using git commit --amend and push again\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix commit-quality-gate — {describe the issue}\""
    };
  }

  return null;
};
