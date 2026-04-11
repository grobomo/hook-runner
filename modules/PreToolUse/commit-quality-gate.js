// WORKFLOW: shtd
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
      reason: "COMMIT MESSAGE TOO SHORT: " + words.length + " words (min " + MIN_WORDS + ").\n" +
        "Your message: \"" + msg + "\"\n" +
        "Good format: \"Fix <what> — <why>\" or \"Add <feature> for <purpose>\"\n" +
        "Example: \"Fix F5 marketplace import — winpath() needed when MSYS_NO_PATHCONV=1\""
    };
  }

  // Check for generic starts without specifics
  if (GENERIC_STARTS.test(msg) && words.length < 8) {
    return {
      decision: "block",
      reason: "COMMIT MESSAGE TOO GENERIC: starts with '" + words[0] + "' without enough detail.\n" +
        "Your message: \"" + msg + "\"\n" +
        "Say WHAT changed and WHY. Example: \"Fix spec-gate cache — stale hasUnchecked when tasks.md edited\""
    };
  }

  return null;
};
