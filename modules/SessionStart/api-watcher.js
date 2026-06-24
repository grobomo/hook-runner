// WORKFLOW: shtd, gsd, starter
// WHY: API outages kill sessions silently — no Stop hook fires, no recovery happens.
// The watcher runs as a background sentinel from session start. If the transcript
// goes stale AND the API is down, it waits for recovery and respawns automatically.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var os = require("os");

var API_CHECK_SCRIPT = process.env.API_CHECK_SCRIPT || "";
var LOCK_PATH = path.join(os.tmpdir(), "api-check-watcher.lock");
var LOCK_MAX_AGE_MS = 1800000; // 30 min — stale lock cleanup

module.exports = function() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return null;
  if (!fs.existsSync(API_CHECK_SCRIPT)) return null;

  // Prevent duplicate watchers via lock file
  try {
    if (fs.existsSync(LOCK_PATH)) {
      var age = Date.now() - fs.statSync(LOCK_PATH).mtimeMs;
      if (age < LOCK_MAX_AGE_MS) return null; // recent watcher already running
      fs.unlinkSync(LOCK_PATH); // stale lock
    }
    fs.writeFileSync(LOCK_PATH, String(process.pid));
  } catch(e) { return null; }

  try {
    cp.spawn("python3", [API_CHECK_SCRIPT, "--watch", projectDir], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
  } catch(e) {}

  return null;
};
