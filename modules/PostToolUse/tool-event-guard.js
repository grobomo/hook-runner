// TOOLS: Bash, Edit, Write, Read, Agent
// WORKFLOW: haiku-rules
// WHY: Worker visibility was built on fragile probes (pgrep, /proc reads, file mtime).
// This PostToolUse hook emits tool.used events to a JSONL event log, giving real-time
// visibility into what Claude is doing. No-op when CLAUDE_EVENT_LOG is unset (local default).
//
// INCIDENT HISTORY:
// - 2026-05-11 Created (T655). Spec: claude-portable/specs/event-driven-observability/
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

module.exports = async function(input) {
  if (!EVENT_LOG) return null;

  var toolName = (input.tool_name || "").slice(0, 50);
  var toolInput = input.tool_input || {};
  var command = (toolInput.command || toolInput.file_path || toolInput.path || "").slice(0, 200);

  var event = {
    ts: new Date().toISOString(),
    event: "tool.used",
    source: "hook-runner",
    tool: toolName,
    command: command
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
