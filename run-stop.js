#!/usr/bin/env node
"use strict";
// hook-runner Stop — loads global + project-scoped modules
// T390: Only blocking modules (those that return {decision:"block"}) need to
// run synchronously. Everything else is observational and can run in background.
// Strategy: run each module with a 200ms sync budget. If it returns a block,
// great. If it takes longer or is async, defer to background worker.
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var loadModules = require("./load-modules");
var hookLog = require("./hook-log");

// Read input: HOOK_INPUT_FILE (from run-hidden.js) avoids Windows pipe deadlock
var input;
try {
  var raw = process.env.HOOK_INPUT_FILE
    ? fs.readFileSync(process.env.HOOK_INPUT_FILE, "utf-8")
    : fs.readFileSync(0, "utf-8");
  input = JSON.parse(raw);
} catch (e) {
  process.exit(0);
}
if (input.stop_hook_active) process.exit(0);

var ctx = hookLog.extractContext("Stop", input);
var modulesDir = process.env.HOOK_RUNNER_MODULES_DIR || path.join(__dirname, "run-modules");
var modulePaths = loadModules(path.join(modulesDir, "Stop"));

// Known blocking modules — these return {decision:"block"} and are fast.
// Run them directly. Everything else goes to background.
var BLOCKING_MODULES = ["auto-continue", "never-give-up"];

var firstBlock = null;
var bgPaths = [];

for (var i = 0; i < modulePaths.length; i++) {
  var modPath = modulePaths[i];
  var modName = path.basename(modPath, ".js");

  if (BLOCKING_MODULES.indexOf(modName) !== -1) {
    // Run sync — these are fast gate modules
    var startMs = Date.now();
    try {
      var mod = require(modPath);
      var result = mod(input);
      var ms = Date.now() - startMs;
      if (result && result.decision === "block") {
        hookLog.logHook("Stop", modName, "block", Object.assign({}, ctx, { reason: result.reason, ms: ms }));
        if (!firstBlock) firstBlock = result;
      } else {
        hookLog.logHook("Stop", modName, "pass", Object.assign({}, ctx, { ms: ms }));
      }
    } catch (e) {
      hookLog.logHook("Stop", modName, "error", Object.assign({}, ctx, { reason: e.message, ms: Date.now() - startMs }));
    }
  } else {
    // Defer to background
    bgPaths.push(modPath);
  }
}

// Output block immediately
if (firstBlock) {
  process.stdout.write(JSON.stringify(firstBlock));
}

// Spawn background worker for remaining modules
if (bgPaths.length > 0) {
  var tmpFile = path.join(require("os").tmpdir(), "stop-bg-" + process.pid + ".json");
  try {
    fs.writeFileSync(tmpFile, JSON.stringify({
      input: input,
      modules: bgPaths,
      ctx: ctx
    }));
    cp.spawn(process.execPath, [path.join(__dirname, "run-stop-bg.js"), tmpFile], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
  } catch(e) {
    process.stderr.write("hook-runner Stop bg: " + e.message + "\n");
  }
}

process.exit(firstBlock ? 1 : 0);
