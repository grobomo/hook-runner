// WORKFLOW: shtd
// WHY: User directives were treated as one-time context instead of persistent rules.
// UserPromptSubmit: detect instruction-like directives in user messages.
// When user says "always", "never", "make sure", "from now on", "whenever",
// write a flag file so PreToolUse can enforce creating a hook/rule.
// Never blocks — just sets a flag for downstream enforcement.
var fs = require("fs");
var path = require("path");
var os = require("os");

var FLAG_FILE = path.join(os.tmpdir(), ".claude-instruction-pending");

// Patterns that indicate the user is giving a persistent instruction
var INSTRUCTION_PATTERNS = [
  /\balways\b.*\b(do|use|check|add|run|include|make|ensure|write|create|enforce)\b/i,
  /\bnever\b.*\b(do|use|skip|delete|remove|push|send|commit|hardcode)\b/i,
  /\bmake sure\b/i,
  /\bfrom now on\b/i,
  /\bwhenever\b.*\b(you|claude|i|we)\b/i,
  /\bevery time\b/i,
  /\bin all (future|cases|projects)\b/i,
  /\benforce\b.*\b(that|this|rule|policy)\b/i,
];

// Exceptions — instructions about creating hooks/rules themselves shouldn't trigger
var EXCEPTION_PATTERNS = [
  /\bhook\b/i,
  /\brule\b.*\bfile\b/i,
  /\.claude\/rules\//i,
  /run-modules\//i,
];

module.exports = function(input) {
  try {
    var prompt = "";
    if (input && input.message && typeof input.message === "string") {
      prompt = input.message;
    } else if (input && input.prompt && typeof input.prompt === "string") {
      prompt = input.prompt;
    }
    if (!prompt || prompt.length < 10) return null;

    // Check if any instruction pattern matches
    var matched = null;
    for (var i = 0; i < INSTRUCTION_PATTERNS.length; i++) {
      if (INSTRUCTION_PATTERNS[i].test(prompt)) {
        matched = INSTRUCTION_PATTERNS[i].source;
        break;
      }
    }
    if (!matched) {
      // No instruction detected — clear any stale flag
      try { fs.unlinkSync(FLAG_FILE); } catch(e) {}
      return null;
    }

    // Check exceptions — if user is already talking about hooks/rules, don't flag
    for (var j = 0; j < EXCEPTION_PATTERNS.length; j++) {
      if (EXCEPTION_PATTERNS[j].test(prompt)) {
        try { fs.unlinkSync(FLAG_FILE); } catch(e) {}
        return null;
      }
    }

    // Write flag file with the detected instruction
    var flag = JSON.stringify({
      ts: new Date().toISOString(),
      pattern: matched,
      preview: prompt.substring(0, 200)
    });
    fs.writeFileSync(FLAG_FILE, flag);
  } catch(e) {
    // Never fail
  }
  return null;
};
