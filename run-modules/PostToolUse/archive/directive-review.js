"use strict";
// PostToolUse: after Edit/Write completes, review the written content for directive
// language that should have been a hook. This catches cases the PreToolUse gate missed
// (e.g., small edits that are part of a larger directive pattern).
//
// Returns a warning message that gets injected into Claude's context, reminding it
// to create enforcement hooks instead of relying on written instructions.

var fs = require("fs");
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
];

function isEnforcementFile(filePath) {
  var norm = filePath.replace(/\\/g, "/");
  if (/run-modules\/.*\.js$/.test(norm)) return true;
  if (/\.claude\/rules\/.*\.md$/.test(norm)) return true;
  if (/\/rules\/.*\.md$/.test(norm)) return true;
  if (/hooks\/run-.*\.js$/.test(norm)) return true;
  if (/settings\.json$/.test(norm)) return true;
  return false;
}

function isSpecOrDoc(filePath) {
  var norm = filePath.replace(/\\/g, "/");
  if (/\/specs\//.test(norm)) return true;
  if (/CLAUDE\.md$/.test(norm)) return true;
  if (/README\.md$/.test(norm)) return true;
  if (/TODO\.md$/.test(norm)) return true;
  return false;
}

module.exports = function(input) {
  var tool = input.tool_name;
  var toolInput = input.tool_input || {};

  // --- Review Bash commands for undocumented ad-hoc patterns ---
  if (tool === "Bash") {
    var cmd = toolInput.command || "";
    var result = (input.result || input.output || "").toString().substring(0, 2000);

    // Check if command output suggests a pattern that should be scripted
    var adhocPatterns = [
      { pattern: /docker exec.*curl/i, msg: "Docker exec + curl should be a fleet API script" },
      { pattern: /aws secretsmanager/i, msg: "Secrets Manager calls should be in scripts/aws/ or scripts/fleet/" },
      { pattern: /kubectl.*apply|kubectl.*delete/i, msg: "K8s mutations should be in scripts/k8s/" },
      { pattern: /git.*push.*force/i, msg: "Force pushes need justification" },
    ];

    for (var j = 0; j < adhocPatterns.length; j++) {
      if (adhocPatterns[j].pattern.test(cmd)) {
        return "POST-BASH REVIEW: " + adhocPatterns[j].msg +
          ". If this is a repeatable operation, create a reusable script. " +
          "Command: " + cmd.substring(0, 100);
      }
    }
    return null;
  }

  // --- Review Edit/Write for directive language ---
  if (tool !== "Edit" && tool !== "Write") return null;

  var filePath = toolInput.file_path || "";
  if (!filePath) return null;

  // Don't review enforcement files or docs/specs
  if (isEnforcementFile(filePath)) return null;
  if (isSpecOrDoc(filePath)) return null;

  // Read the file that was just written
  var content = "";
  try {
    if (!fs.existsSync(filePath)) return null;
    content = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    return null;
  }

  // Only check text-ish files
  if (content.length > 50000 || content.length < 50) return null;

  // Count directive patterns in the full file
  var matchCount = 0;
  var matched = [];
  for (var i = 0; i < DIRECTIVE_PATTERNS.length; i++) {
    var matches = content.match(new RegExp(DIRECTIVE_PATTERNS[i].source, "gi"));
    if (matches && matches.length > 0) {
      matchCount += matches.length;
      matched.push(DIRECTIVE_PATTERNS[i].source + " (x" + matches.length + ")");
    }
  }

  // High threshold for post-review (file may naturally have some directive words)
  if (matchCount < 5) return null;

  return "DIRECTIVE REVIEW: " + path.basename(filePath) + " contains " + matchCount +
    " directive patterns (" + matched.join(", ") + "). " +
    "If these are behavioral rules for Claude, they belong in a PreToolUse hook " +
    "(~/.claude/hooks/run-modules/PreToolUse/*.js) that enforces them, " +
    "not in a file that relies on Claude remembering to follow them.";
};
