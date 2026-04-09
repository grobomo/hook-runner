// Shared helper: check if a process ID is still running
// Used by session-cleanup.js and session-collision-detector.js
"use strict";
var cp = require("child_process");

module.exports = function isPidRunning(pid) {
  pid = Number(pid);
  if (isNaN(pid) || pid <= 0 || pid !== Math.floor(pid)) return false;
  try {
    if (process.platform === "win32") {
      var out = cp.execSync("tasklist /FI \"PID eq " + pid + "\" /NH", {
        encoding: "utf-8",
        timeout: 3000,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
      return out.indexOf("" + pid) !== -1;
    } else {
      process.kill(pid, 0);
      return true;
    }
  } catch (e) {
    return false;
  }
};
