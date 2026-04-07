// WORKFLOW: shtd
// WHY: Context-reset spawns new Claude Code tabs that all work on the same project
// simultaneously. This caused 4-5 parallel sessions doing git checkout, git commit,
// branch switching — total chaos. index.lock contention, parallel commits stomping
// each other, branches switching under your feet mid-edit. This module writes a
// session lock file per project and warns if another session is already active.
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var TMP = os.tmpdir();
var PREFIX = ".claude-session-lock-";

// Hash project dir to a safe filename component
function hashDir(dir) {
  return dir.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").substring(0, 80);
}

function isPidRunning(pid) {
  try {
    if (process.platform === "win32") {
      var out = cp.execSync("tasklist /FI \"PID eq " + pid + "\" /NH", {
        encoding: "utf-8",
        timeout: 3000,
        stdio: ["pipe", "pipe", "pipe"]
      });
      return out.indexOf("" + pid) !== -1;
    } else {
      process.kill(pid, 0);
      return true;
    }
  } catch (e) {
    return false;
  }
}

module.exports = function() {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return null;

  var myPpid = process.ppid;
  var lockPrefix = PREFIX + hashDir(projectDir) + "-";
  var myLockFile = path.join(TMP, lockPrefix + myPpid);
  var collisions = [];

  try {
    // Scan for other session locks on the same project
    var files = fs.readdirSync(TMP);
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.indexOf(lockPrefix) !== 0) continue;

      var pidStr = f.substring(lockPrefix.length);
      var pid = parseInt(pidStr, 10);
      if (isNaN(pid) || pid <= 0) continue;

      if (pid === myPpid) continue; // that's us

      if (isPidRunning(pid)) {
        // Another active session on the same project!
        var lockData = {};
        try {
          lockData = JSON.parse(fs.readFileSync(path.join(TMP, f), "utf-8"));
        } catch (e) {}
        collisions.push({
          pid: pid,
          startedAt: lockData.ts || "unknown",
          branch: lockData.branch || "unknown"
        });
      } else {
        // Stale lock — clean it up
        try { fs.unlinkSync(path.join(TMP, f)); } catch (e) {}
      }
    }

    // Write our own lock file
    var branch = "";
    try {
      branch = cp.execSync("git branch --show-current", {
        cwd: projectDir,
        encoding: "utf-8",
        timeout: 3000,
        stdio: ["pipe", "pipe", "pipe"]
      }).trim();
    } catch (e) {}

    fs.writeFileSync(myLockFile, JSON.stringify({
      ts: new Date().toISOString(),
      pid: myPpid,
      project: projectDir,
      branch: branch
    }));
  } catch (e) {
    // Never fail
    return null;
  }

  if (collisions.length > 0) {
    var msg = "SESSION COLLISION WARNING: " + collisions.length +
      " other Claude Code session(s) are working on this same project!\n\n" +
      "Project: " + projectDir + "\n\n";
    for (var c = 0; c < collisions.length; c++) {
      msg += "  - PID " + collisions[c].pid +
        " (started " + collisions[c].startedAt +
        ", branch: " + collisions[c].branch + ")\n";
    }
    msg += "\nRISK: Parallel sessions cause branch switching, index.lock contention, " +
      "and commits stomping each other. Close extra tabs before continuing.\n\n" +
      "If you just did a context-reset, the old tab should have been closed. " +
      "Check for orphaned Claude Code windows and close them.";
    return msg;
  }

  return null;
};
