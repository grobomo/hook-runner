/**
 * event-emitter.js -- Structured event emission for CCC worker telemetry.
 *
 * Used by hook-runner modules to emit events to the worker event log.
 * No-op when CLAUDE_EVENT_LOG is not set (local dev).
 *
 * Usage:
 *   const { emit } = require('./event-emitter');
 *   emit({ event: 'tool.used', tool: 'Bash', command: 'git status' });
 */

var fs = require('fs');
var path = require('path');

var LOG_PATH = process.env.CLAUDE_EVENT_LOG || '';
var MAX_SIZE = 10 * 1024 * 1024; // 10MB rotation threshold

/**
 * Emit a structured event to the event log.
 * No-op if CLAUDE_EVENT_LOG is not set.
 *
 * @param {Object} event - Event fields (event, tool, command, detail, etc.)
 */
function emit(event) {
  if (!LOG_PATH) return;

  var entry = {
    ts: new Date().toISOString(),
    worker_id: process.env.CLAUDE_PORTABLE_ID
      || process.env.INSTANCE_ID
      || process.env.HOSTNAME
      || 'local',
    task_id: process.env.CURRENT_TASK_ID || '',
    stage: process.env.CURRENT_STAGE || ''
  };

  // Merge caller fields (event, source, tool, command, detail, etc.)
  var keys = Object.keys(event);
  for (var i = 0; i < keys.length; i++) {
    entry[keys[i]] = event[keys[i]];
  }

  maybeRotate();

  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Fail silently -- don't crash hooks if log is unwritable
  }
}

/**
 * Rotate the event log if it exceeds MAX_SIZE.
 * Keeps at most 2 files: events.jsonl (current) + events.jsonl.1 (previous).
 */
function maybeRotate() {
  try {
    var stat = fs.statSync(LOG_PATH);
    if (stat.size < MAX_SIZE) return;
  } catch (e) {
    return; // File doesn't exist yet
  }

  try {
    // Delete .2 if it exists
    try { fs.unlinkSync(LOG_PATH + '.2'); } catch (e) { /* ignore */ }
    // Rename .1 -> .2
    try { fs.renameSync(LOG_PATH + '.1', LOG_PATH + '.2'); } catch (e) { /* ignore */ }
    // Rename current -> .1
    fs.renameSync(LOG_PATH, LOG_PATH + '.1');
    // Signal rotation for S3 sync
    try { fs.writeFileSync(LOG_PATH + '.rotated', ''); } catch (e) { /* ignore */ }
  } catch (e) {
    // Rotation failed -- non-fatal, just keep writing to current file
  }
}

module.exports = { emit: emit };
