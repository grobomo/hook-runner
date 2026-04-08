// WORKFLOW: shtd
// WHY: Claude writes behavioral rules as prose in CLAUDE.md or .claude/rules/:
// "Always verify X before Y", "Never run Z without checking W". These are
// suggestions that get ignored next session. The fix is always a hook, never
// prose. This gate blocks when >2 enforcement-like sentences are being added.

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Edit") return null;

  var ti = input.tool_input || {};
  var filePath = (ti.file_path || "").replace(/\\/g, "/");

  // Only gate enforcement-target files
  var isClaudeMd = filePath.indexOf("/CLAUDE.md") !== -1;
  var isRules = filePath.indexOf("/.claude/rules/") !== -1 && filePath.slice(-3) === ".md";
  var isTodo = filePath.indexOf("/TODO.md") !== -1;
  if (!isClaudeMd && !isRules && !isTodo) return null;

  // Get the text being written
  var text = "";
  if (tool === "Write") text = ti.content || "";
  if (tool === "Edit") text = ti.new_string || "";
  if (!text) return null;

  // Enforcement-like patterns: imperative verbs directed at Claude
  var ENFORCEMENT_PATTERNS = [
    /\b(always|never|must|shall)\s+[a-z]/i,
    /\bdo\s+not\s+[a-z]/i,
    /\bbefore\s+(doing|running|editing|writing|pushing)\b/i,
    /\bafter\s+(doing|running|editing|writing|pushing)\b.*\bverify\b/i,
    /\bmandatory\s*:/i,
    /\bprocedure\s*:/i,
    /\brequired\s+workflow\s*:/i,
    /\bstep\s+\d+\s*:/i
  ];

  // Allowlist patterns: factual documentation, not enforcement
  var ALLOW_PATTERNS = [
    /\bthe\s+(hook|module|gate|runner)\s+(always|never|must)/i,  // describing existing hooks
    /\bis\s+always\b/i,         // "X is always Y" = factual
    /\bwill\s+always\b/i,       // "X will always Y" = factual
    /\bnever\s+returns?\b/i,    // "function never returns null" = factual
    /\bmust\s+be\s+/i,          // "field must be string" = type doc
    /\bIP\s*:/i,                // IP addresses
    /\bURL\s*:/i,               // URLs
    /\bversion\s*:/i,           // version info
    /\b\d+\.\d+\.\d+\b/        // semver = factual
  ];

  var lines = text.split("\n");
  var enforcementCount = 0;
  var enforcementExamples = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();

    // Skip empty lines, headings, code blocks, comments
    if (!trimmed) continue;
    if (trimmed.charAt(0) === "#") continue;
    if (trimmed.indexOf("```") === 0) continue;
    if (trimmed.indexOf("//") === 0) continue;
    if (trimmed.indexOf("- [") === 0) continue; // task checkboxes

    // Check if line is allowed (factual documentation)
    var isAllowed = false;
    for (var a = 0; a < ALLOW_PATTERNS.length; a++) {
      if (ALLOW_PATTERNS[a].test(trimmed)) { isAllowed = true; break; }
    }
    if (isAllowed) continue;

    // Check for enforcement patterns
    for (var p = 0; p < ENFORCEMENT_PATTERNS.length; p++) {
      if (ENFORCEMENT_PATTERNS[p].test(trimmed)) {
        enforcementCount++;
        if (enforcementExamples.length < 3) {
          enforcementExamples.push(trimmed.substring(0, 80));
        }
        break; // one match per line is enough
      }
    }
  }

  // Threshold: >2 enforcement sentences = likely writing manual rules
  if (enforcementCount > 2) {
    return {
      decision: "block",
      reason: "PROSE ENFORCEMENT DETECTED (" + enforcementCount + " rule-like sentences).\n\n" +
        "Examples:\n  - " + enforcementExamples.join("\n  - ") + "\n\n" +
        "You're writing manual enforcement rules. These don't survive context resets.\n" +
        "Build a hook in the hook-runner project instead.\n" +
        "Prose rules = suggestions. Hooks = enforcement.\n\n" +
        "If this is documenting EXISTING hooks, rephrase as descriptions:\n" +
        "  BAD:  \"Always run tests before pushing\"\n" +
        "  GOOD: \"test-before-done.js blocks Stop if tests haven't run\""
    };
  }

  return null;
};
