// TOOLS: Bash
// WORKFLOW: shtd, starter
// WHY: Claude declares victory prematurely — "all tests pass", "complete", "all green" in
// commit messages when failures were skipped, warnings ignored, or outputs not reviewed.
// This cost hours in E2E cycles where bugs shipped because the commit message said "done".
// T560: Now checks for test evidence from PostToolUse/test-evidence.js before blocking.
// If tests were run recently (< 10 min) with 0 failures, allows the commit.
"use strict";
var fs = require("fs");
var os = require("os");
var path = require("path");

var VICTORY_WORDS = /\b(all\s+(tests?\s+)?pass(ed|ing|es)?|all\s+green|succeeded|fully\s+working|complete[ds]?\s+successfully|all\s+(\w+\s+)?complete[ds]?|100%|zero\s+fail)/i;

var EVIDENCE_PATH = path.join(os.tmpdir(), ".hook-runner-test-evidence.json");
var MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function readTestEvidence() {
  try {
    var data = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf-8"));
    if (!data.ts || !data.passed) return null;
    if (Date.now() - data.ts > MAX_AGE_MS) return null;
    return data;
  } catch (e) { return null; }
}

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

  // T560: Check for recent test evidence before blocking.
  // If tests were run recently with 0 failures, the victory claim is backed by evidence.
  var evidence = readTestEvidence();
  if (evidence && evidence.failed === 0 && evidence.passed > 0) {
    return null; // evidence-backed — allow
  }

  // No evidence or evidence has failures — block
  var evidenceHint = "";
  if (evidence && evidence.failed > 0) {
    evidenceHint = "\n\nTEST EVIDENCE FOUND but has failures: " + evidence.summary +
      " (" + Math.round((Date.now() - evidence.ts) / 1000) + "s ago).\n" +
      "Fix the failures before claiming success.";
  } else {
    evidenceHint = "\n\nNO TEST EVIDENCE FOUND. Run tests first — the test-evidence\n" +
      "PostToolUse module records results automatically when tests run.";
  }

  return {
    decision: "block",
    reason: "VICTORY DECLARATION in commit message.\n\n" +
      "Your message claims success: \"" + msg.substring(0, 120) + "\"\n" +
      evidenceHint + "\n\n" +
      "To pass this gate:\n" +
      "  1. Run your tests (results are recorded automatically)\n" +
      "  2. Commit again — gate checks for recent evidence of 0 failures\n\n" +
      "If tests already passed, include specifics:\n" +
      "  BAD:  \"All tests pass\"\n" +
      "  GOOD: \"T442: Fix testbox gate — 17/17 pass, synced to live\""
  };
};
