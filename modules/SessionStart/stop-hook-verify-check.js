// WORKFLOW: shtd, starter
// TOOLS: SessionStart
// WHY: Stop hook broke silently for 24h+ (T747, T759) with no detection.
// This runs stop-hook-verify.js on every session boot and injects the result.
// If broken, Claude sees the issue immediately and can auto-fix.
//
// INCIDENT HISTORY:
// 2026-05-29: T747 — hook-debug.js missing, run-stop.js crashed every stop. No alert for 24h.
// 2026-05-30: T759 — exit(0) on re-entrant made stop hook invisible. User had to report it.
// 2026-06-01: T767 — Built verify script + this SessionStart module to prevent recurrence.
"use strict";

var cp = require("child_process");
var path = require("path");
var fs = require("fs");

var HOME = process.env.HOME || process.env.USERPROFILE || "";
var HOOK_LOG = path.join(HOME, ".claude", "hooks", "hook-log.jsonl");

function _log(entry) {
  entry.ts = new Date().toISOString();
  entry.module = "stop-hook-verify-check";
  entry.event = "SessionStart";
  try { fs.appendFileSync(HOOK_LOG, JSON.stringify(entry) + "\n"); } catch (e) {}
}

module.exports = function(input) {
  var scriptPaths = [
    path.join(__dirname, "..", "..", "scripts", "stop-hook-verify.js"),
  ];

  var scriptPath = null;
  for (var i = 0; i < scriptPaths.length; i++) {
    if (fs.existsSync(scriptPaths[i])) { scriptPath = scriptPaths[i]; break; }
  }

  if (!scriptPath) {
    _log({ result: "skip", reason: "verify script not found" });
    return null;
  }

  try {
    var result = cp.execSync(
      "node " + JSON.stringify(scriptPath) + " --fix --summary",
      { encoding: "utf-8", timeout: 10000, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
    );
    var summary = result.trim();
    _log({ result: "ok", summary: summary });
    return { text: "[stop-hook-verify] " + summary };
  } catch (e) {
    var output = (e.stdout || "").trim();
    _log({ result: "issues", output: output.slice(0, 200) });
    return { text: "[stop-hook-verify] " + (output || "Verification failed: " + (e.message || "").slice(0, 100)) };
  }
};
