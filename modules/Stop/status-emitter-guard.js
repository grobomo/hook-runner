// TOOLS: *
// WHY: Workers needed coarse-grained checkpoints. This Stop module emits claude.stopped
// events to the event log every time Claude exits (every 5-10 min). Combined with
// tool.used events from PostToolUse, enables stuck detection without pgrep/proc probes.
// No-op when CLAUDE_EVENT_LOG is unset (local default).
//
// INCIDENT HISTORY:
// - 2026-05-11 Created (T656). Spec: claude-portable/specs/event-driven-observability/
"use strict";
var fs = require("fs");

var EVENT_LOG = process.env.CLAUDE_EVENT_LOG || "";
var MAX_SIZE = 10 * 1024 * 1024; // 10MB

function rotate(logPath) {
  try {
    var stat = fs.statSync(logPath);
    if (stat.size >= MAX_SIZE) {
      var prev = logPath + ".1";
      try { fs.unlinkSync(prev); } catch (e) {}
      fs.renameSync(logPath, prev);
    }
  } catch (e) {}
}

module.exports = function(input) {
  if (!EVENT_LOG) return null;

  var stopReason = "";
  if (input && input.stop_hook_reason) stopReason = String(input.stop_hook_reason).slice(0, 200);
  if (!stopReason && input && input.reason) stopReason = String(input.reason).slice(0, 200);

  var event = {
    ts: new Date().toISOString(),
    event: "claude.stopped",
    source: "hook-runner",
    detail: stopReason || "unknown"
  };

  var workerId = process.env.WORKER_ID || process.env.HOSTNAME || "";
  if (workerId) event.worker_id = workerId;

  var taskId = process.env.CURRENT_TASK_ID || "";
  if (taskId) event.task_id = taskId;

  var stage = process.env.CURRENT_STAGE || "";
  if (stage) event.stage = stage;

  rotate(EVENT_LOG);
  try { fs.appendFileSync(EVENT_LOG, JSON.stringify(event) + "\n"); } catch (e) {}

  return null;
};
