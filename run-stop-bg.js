#!/usr/bin/env node
"use strict";
// hook-runner Stop background worker
// Runs async/slow Stop modules that were deferred by run-stop.js.
// Spawned as a detached process so it doesn't block the hook timeout.
var fs = require("fs");
var path = require("path");
var hookLog = require("./hook-log");
var runAsync = require("./run-async");

var tmpFile = process.argv[2];
if (!tmpFile || !fs.existsSync(tmpFile)) process.exit(0);

var data;
try {
  data = JSON.parse(fs.readFileSync(tmpFile, "utf-8"));
  fs.unlinkSync(tmpFile); // Clean up immediately
} catch(e) {
  process.exit(0);
}

var input = data.input;
var ctx = data.ctx;
var modulePaths = data.modules || [];

// Load the deferred modules
var modules = [];
for (var i = 0; i < modulePaths.length; i++) {
  try {
    var fn = require(modulePaths[i]);
    var name = path.basename(modulePaths[i], ".js");
    modules.push({ name: name, fn: fn, path: modulePaths[i] });
  } catch(e) {
    hookLog.logHook("Stop", path.basename(modulePaths[i], ".js"), "error",
      Object.assign({}, ctx, { reason: "bg-load: " + e.message, ms: 0 }));
  }
}

if (modules.length === 0) process.exit(0);

// Run modules with async support (same as original run-stop.js did)
runAsync.runModules(modules, input,
  function handleResult(modName, result, err, ms) {
    if (err) {
      hookLog.logHook("Stop", modName, "error", Object.assign({}, ctx, { reason: err.message, ms: ms }));
      return false;
    }
    if (result && result.decision === "block") {
      hookLog.logHook("Stop", modName, "block", Object.assign({}, ctx, { reason: result.reason, ms: ms }));
    } else {
      hookLog.logHook("Stop", modName, "pass", Object.assign({}, ctx, { ms: ms }));
    }
    return false;
  },
  function handleDone() {
    // All background modules complete
    process.exit(0);
  }
);
