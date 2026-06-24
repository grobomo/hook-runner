#!/usr/bin/env node
"use strict";
// Centralized hook logger — appends to ~/.claude/hooks/hook-log.jsonl
// Called by each runner after every module invocation.
var fs = require("fs");
var path = require("path");
var os = require("os");

var LOG_PATH = path.join(os.homedir(), ".claude", "hooks", "hook-log.jsonl");
var MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB — rotate when exceeded

/**
 * Log a hook module invocation.
 * @param {string} event - PreToolUse, PostToolUse, Stop, SessionStart
 * @param {string} moduleName - e.g. "enforcement-gate"
 * @param {string} result - "pass", "block", "error", "text"
 * @param {object} context - { tool, command, file, reason, project, ms }
 */
function logHook(event, moduleName, result, context) {
  try {
    var entry = {
      ts: new Date().toISOString(),
      event: event,
      module: moduleName,
      result: result,
    };
    if (context) {
      if (context.tool) entry.tool = context.tool;
      if (context.command) entry.cmd = context.command.substring(0, 120);
      if (context.file) entry.file = path.basename(context.file);
      if (context.reason) entry.reason = context.reason.substring(0, 200);
      if (context.project) entry.project = context.project;
      if (typeof context.ms === "number") entry.ms = context.ms;
    }

    var line = JSON.stringify(entry) + "\n";

    // Rotate if too large
    try {
      var stat = fs.statSync(LOG_PATH);
      if (stat.size > MAX_LOG_SIZE) {
        var rotated = LOG_PATH + ".1";
        if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
        fs.renameSync(LOG_PATH, rotated);
      }
    } catch (e) { /* file doesn't exist yet, that's fine */ }

    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    // Never let logging break the hook
  }
}

/**
 * Extract context from hook input for logging.
 */
function extractContext(event, input) {
  var ctx = {};
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (projectDir) ctx.project = path.basename(projectDir);

  if (event === "PreToolUse" || event === "PostToolUse") {
    var toolInput = input.tool_input || {};
    ctx.tool = input.tool_name || "";
    if (toolInput.command) ctx.command = toolInput.command;
    if (toolInput.file_path) ctx.file = toolInput.file_path;
  }

  return ctx;
}

module.exports = { logHook: logHook, extractContext: extractContext, LOG_PATH: LOG_PATH };
