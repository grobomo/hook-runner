// WORKFLOW: code-quality
// WHY: share/ is the customer deliverable shipped to many different customers.
// Customer names, internal project codenames, meeting note references, and
// employee names leaked into share/ files multiple times during development.
// This gate blocks Write/Edit to any file under share/ when the content
// contains customer-specific or internal-only references.

var BLOCKED_PATTERNS = [
  // Customer / project codenames
  /\b(Olympus|Ridgeline|EEMSG|BCAP)\b/i,
  // Internal meeting references
  /\b[Cc]adence\s+notes?\b/,
  /\bsession\s+notes?\s+\d/i,
  // Employee names — never in deliverables
  /\bjoelg?\b/i,
  /\bjoel[\s-]?ginsberg\b/i,
  // AI tool references — customer shouldn't see these
  /\bClaude\s+(Code|session|context)\b/i,
  // Internal ticket / task references
  /\bT0\d{2}\b/,
  // Internal repo references
  /\bjoel-ginsberg_tmemu\b/,
  /\bgrobomo\b/,
];

// Allowlist: patterns that look like matches but are OK
var ALLOW_PATTERNS = [
  /azure_environment/,  // variable name, not a reference
];

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Edit") return null;

  var ti = input.tool_input || {};
  var filePath = (ti.file_path || "").replace(/\\/g, "/");

  // Only gate files under share/
  if (filePath.indexOf("/share/") === -1) return null;

  var text = "";
  if (tool === "Write") text = ti.content || "";
  if (tool === "Edit") text = ti.new_string || "";
  if (!text) return null;

  // Check each line, skip comments
  var lines = text.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var trimmed = line.trim();
    // Skip pure comment lines
    if (/^(\/\/|#|\/\*|\*|<!--)/.test(trimmed)) continue;

    for (var p = 0; p < BLOCKED_PATTERNS.length; p++) {
      var match = line.match(BLOCKED_PATTERNS[p]);
      if (match) {
        // Check allowlist
        var allowed = false;
        for (var a = 0; a < ALLOW_PATTERNS.length; a++) {
          if (ALLOW_PATTERNS[a].test(line)) { allowed = true; break; }
        }
        if (allowed) continue;

        return {
          decision: "block",
          reason: "CUSTOMER-SPECIFIC CONTENT IN share/ BLOCKED.\n" +
            "Found: \"" + match[0] + "\" in line: " + trimmed.substring(0, 80) + "\n\n" +
            "share/ is shipped to many customers. It must be 100% generic.\n" +
            "Put customer-specific notes in: notes/, specs/, CLAUDE.md, or .claude/rules/\n" +
            "Code comments in share/ should explain WHY the code works, not which customer drove the change."
        };
      }
    }
  }

  return null;
};
