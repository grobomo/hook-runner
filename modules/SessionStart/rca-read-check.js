// TOOLS: SessionStart
// WORKFLOW: shtd, starter, haiku-rules
// WHY: RCAs written after incidents were never read by subsequent sessions,
// causing the same problems to repeat. Sessions must see recent RCAs on startup.
// T822: At session start, check docs/rca/ for RCAs from last 7 days.
//
// INCIDENT HISTORY:
// 2026-06-02: T822 — Sessions repeatedly hit the same issues (tab accumulation,
//   transcript path errors) because nobody read the RCAs from previous sessions.
//   The knowledge existed but wasn't surfaced at the right time.
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
var HOOK_LOG = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "rca-read-check";
  entry.event = "SessionStart";
  try { fs.appendFileSync(HOOK_LOG, JSON.stringify(entry) + "\n"); } catch (e) {}
}

module.exports = function() {
  var rcaDir = path.join(PROJECT_DIR, "docs", "rca");

  try {
    if (!fs.existsSync(rcaDir)) return null;
  } catch (e) { return null; }

  var cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
  var recentRcas = [];

  try {
    var files = fs.readdirSync(rcaDir);
    for (var i = 0; i < files.length; i++) {
      if (!/\.md$/i.test(files[i])) continue;
      var fp = path.join(rcaDir, files[i]);
      try {
        var stat = fs.statSync(fp);
        if (stat.mtimeMs > cutoff) {
          recentRcas.push(files[i]);
        }
      } catch (e) {}
    }
  } catch (e) { return null; }

  if (recentRcas.length === 0) {
    log({ action: "no-recent-rcas" });
    return null;
  }

  log({ action: "rcas-found", count: recentRcas.length, files: recentRcas });

  process.stderr.write(
    "[T822] " + recentRcas.length + " RCA(s) from the last 7 days in docs/rca/:\n" +
    recentRcas.map(function(f) { return "  - " + f; }).join("\n") + "\n" +
    "Read these before starting work to avoid repeating known issues.\n"
  );
  return null; // Non-blocking
};
