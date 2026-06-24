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
var modulesDir = process.env.HOOK_RUNNER_MODULES_DIR || path.join(__dirname, "run-modules");
var modules = loadModules(path.join(modulesDir, "PostToolUse"), input.tool_name);

// T378: Run all modules before exiting (consistent with T376 Stop runner fix).
// PostToolUse is monitoring/reporting — all modules run, none block (T803).

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
      return false; // T378: continue running remaining modules
    }
    if (result && result.text) {
      process.stderr.write(result.text + "\n");
    }
    hookLog.logHook("PostToolUse", modName, "pass", Object.assign({}, ctx, { ms: ms }));
    return false;
  },
  function handleDone() {
    // T803: PostToolUse NEVER blocks — the action already happened.
    // Module block decisions are logged and printed to stderr (line 46)
    // but NOT propagated to Claude Code. Blocking after the fact is
    // pointless and confuses Claude into thinking the action failed.
    // No output = allow (always)
  }
);
