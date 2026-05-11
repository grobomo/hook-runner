// TOOLS: Bash
// WORKFLOW: shtd, starter
// WHY: Claude declares victory prematurely — "all tests pass", "complete", "all green" in
// commit messages when failures were skipped, warnings ignored, or outputs not reviewed.
// This cost hours in E2E cycles where bugs shipped because the commit message said "done".
// T560: Now checks for test evidence from PostToolUse/test-evidence.js before blocking.
// T637: Haiku judge integration — regex pre-filters, then haiku-judge does semantic check
//       to reduce false positives. Falls back to regex-only when judge is unavailable.
//
// INCIDENT HISTORY:
//   2026-04: Claude committed "all tests pass" when 3 suites were skipped.
//   2026-05: Tightened regex (T634) — bare "completed" no longer triggers.
//   2026-05: Added haiku-judge (T637) — semantic check catches nuanced claims.
"use strict";
var fs = require("fs");
var os = require("os");
var path = require("path");

var judge = require("./_haiku-judge");

var VICTORY_WORDS = /\b(all\s+(tests?\s+)?pass(ed|ing|es)?|all\s+green|succeeded|fully\s+working|complete[ds]?\s+successfully|all\s+(\w+\s+)?complete[ds]?|100%|zero\s+fail)/i;

var EVIDENCE_PATH = path.join(os.tmpdir(), ".hook-runner-test-evidence.json");
var MAX_AGE_MS = 10 * 60 * 1000;

function readTestEvidence() {
  try {
    var data = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf-8"));
    if (!data.ts || !data.passed) return null;
    if (Date.now() - data.ts > MAX_AGE_MS) return null;
    return data;
  } catch (e) { return null; }
}

function buildBlockReason(msg, evidence) {
  var evidenceHint = "";
  if (evidence && evidence.failed > 0) {
    evidenceHint = "\n\nTEST EVIDENCE FOUND but has failures: " + evidence.summary +
      " (" + Math.round((Date.now() - evidence.ts) / 1000) + "s ago).\n" +
      "Fix the failures before claiming success.";
  } else {
    evidenceHint = "\n\nNO TEST EVIDENCE FOUND. Run tests first — the test-evidence\n" +
      "PostToolUse module records results automatically when tests run.";
  }

  return "VICTORY DECLARATION in commit message.\n\n" +
    "Your message claims success: \"" + msg.substring(0, 120) + "\"\n" +
    evidenceHint + "\n\n" +
    "To pass this gate:\n" +
    "  1. Run your tests (results are recorded automatically)\n" +
    "  2. Commit again — gate checks for recent evidence of 0 failures\n\n" +
    "If tests already passed, include specifics:\n" +
    "  BAD:  \"All tests pass\"\n" +
    "  GOOD: \"T442: Fix testbox gate — 17/17 pass, synced to live\"";
}

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = "";
  try {
    cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || "";
  } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  if (!/git\s+commit/.test(cmd)) return null;

  var msg = "";
  var heredocMatch = cmd.match(/\-m\s+"\$\(cat\s+<<'?EOF'?\s*\n([\s\S]*?)\nEOF/);
  if (heredocMatch) {
    msg = heredocMatch[1].trim();
  } else {
    var mMatch = cmd.match(/\-m\s+["']([^"']+)["']/);
    if (mMatch) msg = mMatch[1].trim();
  }

  if (!msg) return null;

  var title = msg.split("\n")[0];

  if (!VICTORY_WORDS.test(title)) return null;

  var evidence = readTestEvidence();
  if (evidence && evidence.failed === 0 && evidence.passed > 0) {
    return null;
  }

  // T637: Use haiku-judge for semantic verification
  return judge({
    question: "Is this git commit message making an unsubstantiated claim of success? " +
      "Claims like 'all tests pass' or 'all green' without specific numbers are premature. " +
      "Messages with specific test counts ('17/17 pass') or task IDs are fine.",
    context: "Commit title: " + title.slice(0, 200) +
      "\nTest evidence: " + (evidence ? "found with " + evidence.failed + " failures" : "none"),
    gate: "victory-declaration-gate",
    fallback: "block"
  }).then(function(result) {
    if (result.allow) return null;
    return {
      decision: "block",
      reason: (result.fallback_used ? "" : "HAIKU JUDGE: " + (result.reason || "") + "\n\n") +
        buildBlockReason(msg, evidence)
    };
  });
};
