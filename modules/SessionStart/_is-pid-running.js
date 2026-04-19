// Shared helper: check if a process ID is still running
// Used by session-cleanup.js and session-collision-detector.js
// T499: Replaced Windows tasklist (~200ms/call) with process.kill(pid, 0) (<1ms).
// Signal 0 doesn't kill — just checks existence. EPERM = exists but no permission.
"use strict";

module.exports = function isPidRunning(pid) {
  pid = Number(pid);
  if (isNaN(pid) || pid <= 0 || pid !== Math.floor(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = process exists but we lack permission (e.g. system process) — still running
    return e.code === "EPERM";
  }
};
