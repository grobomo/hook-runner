#!/usr/bin/env node
"use strict";
// hook-runner Stop — loads global + project-scoped modules
// Supports both sync and async modules (async awaited with 4s timeout)
// T376: Runs ALL modules before exiting — collects first block but continues
// so observational modules (self-reflection, drift-review, etc.) always execute.
var fs = require("fs");
var path = require("path");
var loadModules = require("./load-modules");
var hookLog = require("./hook-log");
var runAsync = require("./run-async");

var input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf-8"));
} catch (e) {
  process.exit(0);
}
if (input.stop_hook_active) process.exit(0);

var ctx = hookLog.extractContext("Stop", input);
var modules = loadModules(path.join(__dirname, "run-modules", "Stop"));

// T376: Collect first block result but keep running remaining modules
var firstBlock = null;

runAsync.runModules(modules, input,
  function handleResult(modName, result, err, ms) {
    if (err) {
      hookLog.logHook("Stop", modName, "error", Object.assign({}, ctx, { reason: err.message, ms: ms }));
      process.stderr.write("hook-runner Stop " + modName + " error: " + err.message + "\n");
      return false;
    }
    if (result && result.decision === "block") {
      hookLog.logHook("Stop", modName, "block", Object.assign({}, ctx, { reason: result.reason, ms: ms }));
      if (!firstBlock) firstBlock = result;
      return false; // T376: continue running remaining modules
    }
    hookLog.logHook("Stop", modName, "pass", Object.assign({}, ctx, { ms: ms }));
    return false;
  },
  function handleDone() {
    // T376: Output collected block (if any) after all modules have run
    if (firstBlock) {
      process.stdout.write(JSON.stringify(firstBlock));
      process.exit(0);
    }
    // No block = allow stop
  }
);
