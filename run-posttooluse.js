#!/usr/bin/env node
"use strict";
// hook-runner PostToolUse — loads global + project-scoped modules
// Supports both sync and async modules (async awaited with 4s timeout)
var fs = require("fs");
var path = require("path");
var loadModules = require("./load-modules");
var hookLog = require("./hook-log");
var runAsync = require("./run-async");

var input;
try {
  var raw = process.env.HOOK_INPUT_FILE
    ? fs.readFileSync(process.env.HOOK_INPUT_FILE, "utf-8")
    : fs.readFileSync(0, "utf-8");
  input = JSON.parse(raw);
} catch (e) {
  process.exit(0);
}

// WHY: Windows tools pass backslash paths — modules expect forward slashes for consistent matching.
if (input && input.tool_input && typeof input.tool_input.file_path === "string") {
  input.tool_input.file_path = input.tool_input.file_path.replace(/\\/g, "/");
}
if (input && input.tool_input && typeof input.tool_input.path === "string") {
  input.tool_input.path = input.tool_input.path.replace(/\\/g, "/");
}

var ctx = hookLog.extractContext("PostToolUse", input);
var modules = loadModules(path.join(__dirname, "run-modules", "PostToolUse"));

// T378: Run all modules before exiting (consistent with T376 Stop runner fix).
// PostToolUse is monitoring/reporting — all modules should run even if one blocks.
var firstResult = null;

runAsync.runModules(modules, input,
  function handleResult(modName, result, err, ms) {
    if (err) {
      hookLog.logHook("PostToolUse", modName, "error", Object.assign({}, ctx, { reason: err.message, ms: ms }));
      process.stderr.write("hook-runner PostToolUse " + modName + " error: " + err.message + "\n");
      return false;
    }
    if (result && result.decision) {
      hookLog.logHook("PostToolUse", modName, result.decision, Object.assign({}, ctx, { reason: result.reason, ms: ms }));
      process.stderr.write(result.reason + "\n");
      if (!firstResult) firstResult = result;
      return false; // T378: continue running remaining modules
    }
    hookLog.logHook("PostToolUse", modName, "pass", Object.assign({}, ctx, { ms: ms }));
    return false;
  },
  function handleDone() {
    if (firstResult) {
      process.stdout.write(JSON.stringify(firstResult));
      process.exit(1);
    }
    // No output = allow
  }
);
