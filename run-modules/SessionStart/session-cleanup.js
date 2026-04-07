// WORKFLOW: shtd
// WHY: Session-scoped temp files (.claude-*-<ppid>) accumulate when Claude Code
// tabs crash or close without cleanup. Stale files waste disk and could confuse
// modules if PIDs get reused. This runs at SessionStart to sweep orphaned files.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var isPidRunning = require("./_is-pid-running");

var TMP = os.tmpdir();
var PREFIX = ".claude-";

// Known state file patterns (without the ppid suffix)
var STATE_NAMES = [
  "instruction-pending-",
  "turn-complete-",
  "self-analyze-cooldown-",
  "bash-failures-"
];

module.exports = function() {
  var cleaned = 0;
  try {
    var files = fs.readdirSync(TMP);
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.indexOf(PREFIX) !== 0) continue;

      // Check if this file matches any known state pattern
      var matched = false;
      for (var j = 0; j < STATE_NAMES.length; j++) {
        var full = PREFIX + STATE_NAMES[j];
        if (f.indexOf(full) === 0) {
          var pidStr = f.substring(full.length).replace(/\.json$/, "");
          var pid = parseInt(pidStr, 10);
          if (!isNaN(pid) && pid > 0 && pid !== process.ppid && !isPidRunning(pid)) {
            try {
              fs.unlinkSync(path.join(TMP, f));
              cleaned++;
            } catch (e) { /* skip */ }
          }
          matched = true;
          break;
        }
      }
    }
    // T351: Also clean session-lock files from collision detector
    // Pattern: .claude-session-lock-<hash>-<pid>
    var LOCK_PREFIX = ".claude-session-lock-";
    for (var k = 0; k < files.length; k++) {
      var lf = files[k];
      if (lf.indexOf(LOCK_PREFIX) !== 0) continue;
      // Extract PID from end of filename (after last dash)
      var lastDash = lf.lastIndexOf("-");
      if (lastDash <= LOCK_PREFIX.length) continue;
      var lockPidStr = lf.substring(lastDash + 1);
      var lockPid = parseInt(lockPidStr, 10);
      if (!isNaN(lockPid) && lockPid > 0 && lockPid !== process.ppid && !isPidRunning(lockPid)) {
        try {
          fs.unlinkSync(path.join(TMP, lf));
          cleaned++;
        } catch (e) { /* skip */ }
      }
    }
  } catch (e) { /* tmpdir read failed */ }

  return null; // SessionStart modules should not block
};
