// WHY: Claude stops and lists options instead of doing the work.
// If Claude ignores the block message, the dead man's switch launches a
// new session via context_reset.py so work continues regardless.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");

function hasPendingTasks() {
  if (!projectDir) return false;
  var todoPath = path.join(projectDir, "TODO.md");
  try {
    var content = fs.readFileSync(todoPath, "utf-8");
    return /- \[ \] /.test(content);
  } catch (e) {
    return false;
  }
}

function launchDeadManSwitch() {
  // Wait 30s, then check if this Claude is still the newest session.
  // If no new session appeared, launch context_reset.py as a fallback.
  var script = home + "/Documents/ProjectsCL1/context-reset/context_reset.py";
  try {
    fs.statSync(script.replace(/\//g, path.sep));
  } catch (e) {
    return; // script missing, can't auto-restart
  }

  // Spawn a detached process that waits then launches
  var pythonCmd = "python \"" + script + "\" --project-dir \"" + projectDir + "\"";
  var wrapper = [
    "import time, subprocess, os",
    "time.sleep(30)",
    "subprocess.Popen(" + JSON.stringify(pythonCmd) + ", shell=True)",
  ].join("; ");

  try {
    var opts = { stdio: "ignore", detached: true };
    if (process.platform === "win32") {
      opts.windowsHide = true;
    }
    var child = cp.spawn("python", ["-c", wrapper], opts);
    child.unref();
  } catch (e) {
    // Silent fail
  }
}

module.exports = function(input) {
  var pending = hasPendingTasks();

  // Launch dead man's switch if tasks remain — if Claude ignores the block
  // and actually stops, this spawns a new session after 30s
  if (pending) {
    launchDeadManSwitch();
  }

  return {
    decision: "block",
    reason: "DO NOT STOP. Follow this order:\n" +
      "1) Check TODO.md — if tasks remain, do the next one NOW.\n" +
      "2) Scan jsonl logs in ~/.claude/projects/ for incomplete tangents — do them.\n" +
      "3) Optimize, secure, clean up the project.\n" +
      "4) Zoom out: what real-world value comes next? Write tasks then EXECUTE.\n\n" +
      (pending ? "TASKS REMAIN in TODO.md. Dead man's switch armed — if you stop, a new session launches in 30s.\n\n" : "") +
      "If context is long, save state to TODO.md then run:\n" +
      "python " + home + "/Documents/ProjectsCL1/context-reset/context_reset.py --project-dir $CLAUDE_PROJECT_DIR\n" +
      "To preserve this tab: touch ~/.claude/.preserve-tab first"
  };
};
