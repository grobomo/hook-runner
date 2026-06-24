// TOOLS: Bash
// WORKFLOW: shtd, gsd
// WHY: Claude commits code while TODO.md or report data still has unresolved FAIL, timeout,
// MISMATCH, or WARN entries. Bugs ship because the commit focused on what worked and skipped
// what didn't. Scanning TODO.md before commit catches overlooked issues.
"use strict";

var fs = require("fs");
var path = require("path");

var ISSUE_PATTERNS = [
  /\bFAIL\b/,
  /\btimeout\b/i,
  /\bMISMATCH\b/,
  /\bWARN(?:ING)?\b/,
  /\bERROR\b/,
  /\bBROKEN\b/i,
  /\bcrash(?:ed|es|ing)?\b/i
];

// Contexts where issue words are expected (completed tasks, descriptions of what was fixed)
var FALSE_POSITIVE_PATTERNS = [
  /- \[x\].*\bFAIL/i,        // completed task mentioning FAIL
  /\bfix(?:ed|es|ing)?\b.*\bFAIL/i,  // "fixed the FAIL"
  /\b0\s+fail/i,             // "0 failed"
  /\b0\s+FAIL/,              // "0 FAIL"
  /passed,\s*0\s+failed/i,   // "405 passed, 0 failed"
  /\bno\s+fail/i,            // "no failures"
  /FAIL\/WARN/               // meta-references like "scan for FAIL/WARN"
];

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  if (!/git\s+commit/.test(cmd)) return null;

  // Find project root (look for .git)
  var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  var todoPath = path.join(projectDir, "TODO.md");

  if (!fs.existsSync(todoPath)) return null;

  var content = "";
  try { content = fs.readFileSync(todoPath, "utf-8"); } catch(e) { return null; }

  // Scan for unchecked tasks with issue keywords
  var lines = content.split("\n");
  var issues = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    // Skip completed tasks
    if (/- \[x\]/.test(line)) continue;
    // Skip lines that are clearly meta-references
    var isFP = false;
    for (var f = 0; f < FALSE_POSITIVE_PATTERNS.length; f++) {
      if (FALSE_POSITIVE_PATTERNS[f].test(line)) { isFP = true; break; }
    }
    if (isFP) continue;

    // Check for issue patterns in unchecked tasks or status lines
    for (var p = 0; p < ISSUE_PATTERNS.length; p++) {
      if (ISSUE_PATTERNS[p].test(line)) {
        // Only flag unchecked task items or explicit status markers
        if (/^\s*-\s*\[ \]/.test(line) || /Status:|TESTING|IN PROGRESS/i.test(line)) {
          issues.push("  L" + (i + 1) + ": " + line.trim().substring(0, 120));
          break;
        }
      }
    }
  }

  if (issues.length === 0) return null;

  // Check if commit message already references the issues
  var msg = "";
  var heredocMatch = cmd.match(/\-m\s+"\$\(cat\s+<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (heredocMatch) {
    msg = heredocMatch[1].trim();
  } else {
    var mMatch = cmd.match(/\-m\s+["']([^"']+)["']/);
    if (mMatch) msg = mMatch[1].trim();
  }

  // If commit message acknowledges the issues (mentions FAIL, known, etc.), allow
  if (msg && /\b(known|pre-existing|intermittent|expected|acknowledged|wontfix)\b/i.test(msg)) {
    return null;
  }

  return {
    decision: "block",
    reason: "BLOCKED: Code commit with unresolved issues in TODO.md or test reports\nWHY: Committing code while known failures, timeouts, or incomplete tasks exist risks deploying broken functionality to production\nNEXT STEPS:\n1. Review TODO.md and test reports to identify all FAIL and timeout entries\n2. Either fix the issues or move them to a future milestone before retrying commit\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix unresolved-issues-gate — {describe the issue}\""
  };
};
