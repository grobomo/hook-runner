#!/usr/bin/env node
"use strict";
// hook-runner PreToolUse — loads global + project-scoped modules
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

var ctx = hookLog.extractContext("PreToolUse", input);
var modules = loadModules(path.join(__dirname, "run-modules", "PreToolUse"));

for (var i = 0; i < modules.length; i++) {
  var modName = path.basename(modules[i], ".js");
  try {
    var mod = require(modules[i]);
    var result = mod(input);
    if (result && result.decision) {
      hookLog.logHook("PreToolUse", modName, result.decision, Object.assign({}, ctx, { reason: result.reason }));
      process.stdout.write(JSON.stringify(result));
      process.exit(0);
    }
    hookLog.logHook("PreToolUse", modName, "pass", ctx);
  } catch (e) {
    hookLog.logHook("PreToolUse", modName, "error", Object.assign({}, ctx, { reason: e.message }));
    process.stderr.write("hook-runner PreToolUse " + modName + " error: " + e.message + "\n");
  }
}
// No output = allow
