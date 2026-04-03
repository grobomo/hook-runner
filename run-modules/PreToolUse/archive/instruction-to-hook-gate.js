"use strict";
// Instruction-to-hook gate: when Claude writes directive language into non-hook files
// (CLAUDE.md, TODO.md, code comments), block and require creating a hook or rule instead.
// Directives in memory/docs are suggestions. Hooks are enforcement.
//
// Allows: writing to hook modules (run-modules/**/*.js) and rule files (.claude/rules/*.md)
// Blocks: writing directive patterns to other files without a corresponding hook

var path = require("path");

var DIRECTIVE_PATTERNS = [
  /\balways\b/i,
  /\bnever\b/i,
  /\bmust\b/i,
  /\bmake sure\b/i,
  /\bfrom now on\b/i,
  /\bwhenever\b/i,
  /\bdo not\b/i,
  /\bensure that\b/i,
  /\brequired to\b/i,
  /\bshall not\b/i,
  /\bprohibited\b/i,
];

// Threshold: need 2+ directive patterns to trigger (avoids false positives on single "never" in code)
var DIRECTIVE_THRESHOLD = 2;

// Files where directives belong (hooks and rules)
function isEnforcementFile(filePath) {
  var norm = filePath.replace(/\\/g, "/");
  // Hook modules
  if (/run-modules\/.*\.js$/.test(norm)) return true;
  // Rule files
  if (/\.claude\/rules\/.*\.md$/.test(norm)) return true;
  if (/\/rules\/.*\.md$/.test(norm)) return true;
  // Hook runner scripts
  if (/hooks\/run-.*\.js$/.test(norm)) return true;
  // Settings files (hook config)
  if (/settings\.json$/.test(norm)) return true;
  return false;
}

// Files where directives are natural (specs, docs, tests) — don't block
function isDocFile(filePath) {
  var norm = filePath.replace(/\\/g, "/");
  if (/\/specs\//.test(norm)) return true;
  if (/CLAUDE\.md$/.test(norm)) return true;
  if (/README\.md$/.test(norm)) return true;
  if (/CONTRIBUTING\.md$/.test(norm)) return true;
  if (/TODO\.md$/.test(norm)) return true;
  if (/scripts\/test\//.test(norm)) return true;  // test fixtures contain directive words
  if (/\.test\.\w+$/.test(norm)) return true;     // test files
  return false;
}

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var toolInput = input.tool_input || {};
  var filePath = toolInput.file_path || "";
  if (!filePath) return null;

  // Always allow writing to enforcement files (that's the goal)
  if (isEnforcementFile(filePath)) return null;

  // Check content for directive patterns
  var content = toolInput.content || toolInput.new_string || "";
  if (!content || content.length < 20) return null;

  var matchCount = 0;
  var matched = [];
  for (var i = 0; i < DIRECTIVE_PATTERNS.length; i++) {
    if (DIRECTIVE_PATTERNS[i].test(content)) {
      matchCount++;
      matched.push(DIRECTIVE_PATTERNS[i].source);
    }
  }

  if (matchCount < DIRECTIVE_THRESHOLD) return null;

  // Doc files get a softer message — allow but warn
  if (isDocFile(filePath)) {
    return null; // Don't block specs/docs, they need directive language naturally
  }

  // Non-enforcement, non-doc file with multiple directives — block
  return {
    decision: "block",
    reason: "DIRECTIVE LANGUAGE IN NON-ENFORCEMENT FILE.\n" +
      "Found " + matchCount + " directive patterns (" + matched.join(", ") + ") in:\n" +
      "  " + filePath + "\n\n" +
      "Directives written to code/config files are just suggestions that get forgotten.\n" +
      "CREATE AN ENFORCEMENT HOOK instead:\n" +
      "  1. Hook module: ~/.claude/hooks/run-modules/PreToolUse/<name>.js\n" +
      "  2. Rule file: <project>/.claude/rules/<name>.md (documentation)\n" +
      "  3. THEN write the code/config change.\n\n" +
      "Hooks enforce. Rules document. Code comments are forgotten."
  };
};
