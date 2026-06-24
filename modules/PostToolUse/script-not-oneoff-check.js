// TOOLS: Bash
// WORKFLOW: shtd, starter
// WHY: Long inline scripts in Bash tool calls die with the session. A 15-line
// Python heredoc or multi-line node -e is untestable, unreviewable, and gone
// when the session ends. Scripts in files survive, get committed, and can be
// reused. This gate flags inline code that should be extracted to a script.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ SCRIPT-NOT-ONEOFF CHECK — Is this inline code that should be a file?   │
// │                                                                        │
// │ After Bash runs, checks if the command contained a long inline script  │
// │ (>10 substantive lines). If so, emits a stderr advisory to extract it  │
// │ to a script file. Non-blocking, advisory only. Deduped per session.    │
// │                                                                        │
// │ INCIDENT HISTORY:                                                      │
// │   2026-06-01: T788 — Claude repeatedly writes 20+ line inline Python   │
// │   and Node.js scripts in Bash heredocs. These scripts are lost when    │
// │   the session ends, can't be tested independently, and aren't version  │
// │   controlled. The no-adhoc-commands gate blocks infra commands but     │
// │   doesn't catch general inline scripting.                              │
// └─────────────────────────────────────────────────────────────────────────┘
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var LOG_PATH = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");
var SESSION = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);

// Session-scoped dedup — only warn once per unique script fingerprint
var warned = {};

// Minimum substantive line count to trigger
var MIN_LINES = 10;

function _log(action, detail) {
  try {
    var entry = JSON.stringify({
      ts: new Date().toISOString(),
      module: "script-not-oneoff-check",
      event: "PostToolUse",
      session: SESSION,
      action: action,
      detail: (detail || "").substring(0, 300)
    }) + "\n";
    fs.appendFileSync(LOG_PATH, entry);
  } catch (e) { /* best effort */ }
}

// Patterns that indicate inline scripting (not just chained commands)
var INLINE_SCRIPT_PATTERNS = [
  // python -c / python3 -c with multiline
  { re: /\bpython[23]?\s+-c\s+/i, lang: "Python" },
  // node -e with multiline
  { re: /\bnode\s+-e\s+/i, lang: "Node.js" },
  // heredoc (<<EOF, <<'EOF', <<-EOF, etc.)
  { re: /<<[-~]?\s*['"]?\w+['"]?/, lang: "heredoc" },
  // perl -e
  { re: /\bperl\s+-e\s+/i, lang: "Perl" },
  // ruby -e
  { re: /\bruby\s+-e\s+/i, lang: "Ruby" },
];

// Commands that are fine inline regardless of length
var SAFE_PATTERNS = [
  // Test runners — long test output is expected
  /^\s*(node|bash|sh)\s+.*test/i,
  /--test\b/,
  // Syntax checks
  /\bnode\s+-c\b/,
  // One-liner node -e for simple ops (under 200 chars, single line equivalent)
  /\bnode\s+-e\s+"[^"]{0,200}"\s*$/,
  /\bnode\s+-e\s+'[^']{0,200}'\s*$/,
  // Simple grep/sed/awk pipelines — line count comes from data, not code
  /^\s*(grep|sed|awk|cut|sort|uniq|tr)\b/,
  // Git log/diff — output is long but command is simple
  /^\s*git\s+(log|diff|show)\b/,
];

function countSubstantiveLines(cmd) {
  var lines = cmd.split("\n");
  var count = 0;
  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    // Skip blank lines and pure comments
    if (trimmed && !trimmed.startsWith("#") && trimmed !== "EOF" &&
        trimmed !== "'" && trimmed !== "\"") {
      count++;
    }
  }
  return count;
}

function detectLang(cmd) {
  for (var p = 0; p < INLINE_SCRIPT_PATTERNS.length; p++) {
    if (INLINE_SCRIPT_PATTERNS[p].re.test(cmd)) {
      return INLINE_SCRIPT_PATTERNS[p].lang;
    }
  }
  return null;
}

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST === "1") return null;
  if (!input) return null;
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string"
      ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) {
    cmd = (input.tool_input || {}).command || "";
  }

  if (!cmd) return null;

  // Quick exit — short commands are fine
  var rawLines = cmd.split("\n").length;
  if (rawLines < MIN_LINES) return null;

  // Check safe patterns first
  for (var s = 0; s < SAFE_PATTERNS.length; s++) {
    if (SAFE_PATTERNS[s].test(cmd)) return null;
  }

  // Count substantive lines
  var substantive = countSubstantiveLines(cmd);
  if (substantive < MIN_LINES) return null;

  // Detect language
  var lang = detectLang(cmd) || "Bash";

  // Dedup — fingerprint by first 100 chars + line count
  var fp = cmd.substring(0, 100).replace(/\s+/g, " ") + ":" + rawLines;
  if (warned[fp]) return null;
  warned[fp] = true;

  _log("flagged", lang + " inline script, " + substantive + " lines: " +
    cmd.substring(0, 120).replace(/\n/g, "\\n"));

  // Non-blocking advisory via stderr
  process.stderr.write(
    "\n[script-not-oneoff] " + substantive + "-line inline " + lang +
    " detected (" + rawLines + " total lines)." +
    "\n  Extract to a script file for testability, version control, and reuse." +
    "\n  Example: scripts/<purpose>.sh or scripts/<purpose>.py\n"
  );

  return null; // Advisory only — never block
};
