// WORKFLOW: shtd, starter
// WHY: Claude declares victory prematurely — "all tests pass", "complete", "all green" in
// commit messages when failures were skipped, warnings ignored, or outputs not reviewed.
// This cost hours in E2E cycles where bugs shipped because the commit message said "done".
"use strict";

var VICTORY_WORDS = /\b(all\s+(tests?\s+)?pass(ed|ing|es)?|all\s+green|succeeded|fully\s+working|complete[ds]?\s+(successfully)?|100%|zero\s+fail)/i;

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  // Only gate git commit commands
  if (!/git\s+commit/.test(cmd)) return null;

  // Extract commit message (heredoc or simple -m)
  var msg = "";
  var heredocMatch = cmd.match(/\-m\s+"\$\(cat\s+<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (heredocMatch) {
    msg = heredocMatch[1].trim();
  } else {
    var mMatch = cmd.match(/\-m\s+["']([^"']+)["']/);
    if (mMatch) msg = mMatch[1].trim();
  }

  if (!msg) return null;

  // Only check the title (first line) — body may quote victory words in descriptions
  var title = msg.split("\n")[0];

  // Check for victory declarations in the title only
  if (!VICTORY_WORDS.test(title)) return null;

  // Block — force specifics instead of vague success claims
  return {
    decision: "block",
    reason: "VICTORY DECLARATION in commit message.\n\n" +
      "Your message claims success: \"" + msg.substring(0, 120) + "\"\n\n" +
      "Before committing, verify:\n" +
      "  1. Did you review EVERY failure, warning, and timeout in the output?\n" +
      "  2. Did you check for empty/missing outputs that should have content?\n" +
      "  3. Did you look at what's NOT in the results that should be?\n" +
      "  4. Are there unresolved FAIL/WARN/MISMATCH in TODO.md?\n\n" +
      "Rephrase with specifics:\n" +
      "  BAD:  \"All tests pass\"\n" +
      "  GOOD: \"T442: Fix testbox gate — 17/17 tests pass, synced to live\"\n\n" +
      "Include the count, the scope, and what was tested."
  };
};
