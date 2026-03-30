#!/usr/bin/env node
"use strict";
// hook-runner PostToolUse — loads global + project-scoped modules
var fs = require("fs");
var path = require("path");
var loadModules = require("./load-modules");
var hookLog = require("./hook-log");

var input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf-8"));
} catch (e) {
  process.exit(0);
}

var ctx = hookLog.extractContext("PostToolUse", input);
var modules = loadModules(path.join(__dirname, "run-modules", "PostToolUse"));

for (var i = 0; i < modules.length; i++) {
  var modName = path.basename(modules[i], ".js");
  try {
    var mod = require(modules[i]);
    var result = mod(input);
    if (result && result.decision) {
      hookLog.logHook("PostToolUse", modName, result.decision, Object.assign({}, ctx, { reason: result.reason }));
      process.stdout.write(JSON.stringify(result));
      process.exit(0);
    }
    hookLog.logHook("PostToolUse", modName, "pass", ctx);
  } catch (e) {
    hookLog.logHook("PostToolUse", modName, "error", Object.assign({}, ctx, { reason: e.message }));
    process.stderr.write("hook-runner PostToolUse " + modName + " error: " + e.message + "\n");
  }
}
