// WORKFLOW: shtd
// WHY: Chat sessions contain valuable context that gets lost when sessions end.
// Auto-exporting to HTML preserves every conversation for later reference without
// manual intervention. Runs async so it doesn't block the stop flow.
// Incident: 2026-04-04 — user requested auto-export on session end.
"use strict";

var cp = require("child_process");
var path = require("path");
var os = require("os");

module.exports = function(input) {
  if (process.env.HOOK_RUNNER_TEST) return null;
  var exportScript = path.join(os.homedir(), ".claude", "skills", "chat-export", "export.py");

  try {
    // Fire and forget — don't block the stop flow
    cp.spawn("python3", [exportScript], {
      detached: true,
      stdio: "ignore"
    }).unref();
  } catch (e) {
    // Silent failure — export is best-effort
  }

  return null;
};
