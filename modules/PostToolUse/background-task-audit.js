// WORKFLOW: shtd, starter
// TOOLS: TaskOutput
// WHY: Claude dismisses zero-output background tasks as "resource contention" or
// "probably hanging" without investigating root cause. Zero output from a background
// task means the command never started, crashed at import, or is deadlocked — all of
// which have specific root causes that must be identified. User corrected this pattern
// 3 times in dd-lab session 22 (2026-05-03).
//
// Evidence: Tasks bjgkq9h59 and batytrlvx both returned zero bytes from TaskOutput.
// Claude said "likely resource contention" and tried to "commit what works and move on"
// instead of investigating why Playwright hung on t1-ddei-002 but not t2-ddei-001.
// User: "dont assume anything and move on... investigate and resolve root cause"
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "TaskOutput") return null;

  var result = (input.tool_result || "").toString();

  // Parse structured TaskOutput fields
  var status = (result.match(/<status>(\w+)<\/status>/) || [])[1] || "";
  var retrieval = (result.match(/<retrieval_status>(\w+)<\/retrieval_status>/) || [])[1] || "";
  var taskId = (result.match(/<task_id>([^<]+)<\/task_id>/) || [])[1] || "unknown";
  var output = (result.match(/<output>([\s\S]*?)<\/output>/) || [])[1] || "";
  output = output.trim();

  // Case 1: Task completed with zero output
  if (status === "completed" && output.length === 0) {
    return {
      decision: "block",
      reason: "ZERO OUTPUT from completed background task " + taskId + ".\n\n" +
        "A completed task with no output means one of:\n" +
        "  - Script crashed before printing (import error, missing module)\n" +
        "  - stdout not flushed (add PYTHONUNBUFFERED=1 env var)\n" +
        "  - Wrong command/path\n" +
        "  - Process was killed before output was captured\n\n" +
        "REQUIRED: Run the same command in foreground with PYTHONUNBUFFERED=1\n" +
        "and a timeout to see the actual error. Do NOT assume or move on."
    };
  }

  // Case 2: Timeout with zero output
  if (retrieval === "timeout" && output.length === 0) {
    return {
      decision: "block",
      reason: "TIMEOUT + ZERO OUTPUT from background task " + taskId + ".\n\n" +
        "The task produced nothing before timing out. Root causes:\n" +
        "  - Process hanging at startup (import, SSH connect, auth prompt)\n" +
        "  - stdout buffering hiding output (use PYTHONUNBUFFERED=1)\n" +
        "  - Blocked on stdin or interactive prompt\n" +
        "  - Network timeout (tunnel dead, port closed)\n\n" +
        "REQUIRED: Stop the task. Run in foreground with short timeout\n" +
        "and PYTHONUNBUFFERED=1 to find where it hangs.\n" +
        "Do NOT dismiss as 'resource contention' or 'probably busy'."
    };
  }

  // Case 3: Still running, checked multiple times, still zero output
  // Track check count per task
  if (retrieval === "not_ready" && output.length === 0) {
    var fs = require("fs");
    var os = require("os");
    var path = require("path");
    var stateFile = path.join(os.tmpdir(), ".bg-task-audit-" + taskId.replace(/[^a-z0-9]/gi, ""));

    var checkCount = 0;
    try {
      var prev = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      checkCount = (prev.checks || 0) + 1;
    } catch(e) {
      checkCount = 1;
    }

    try {
      fs.writeFileSync(stateFile, JSON.stringify({ checks: checkCount, ts: Date.now() }));
    } catch(e) { /* ignore write failure */ }

    if (checkCount >= 2) {
      return {
        decision: "block",
        reason: "BACKGROUND TASK " + taskId + " polled " + checkCount +
          " times with ZERO output.\n\n" +
          "The task is running but has produced nothing after multiple checks.\n" +
          "REQUIRED: Stop the task. Run the command in foreground to find the hang point.\n" +
          "Do NOT keep polling. Do NOT assume 'still starting up'."
      };
    }
  }

  return null;
};
