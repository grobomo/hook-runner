#!/usr/bin/env node
"use strict";
// hook-runner SessionStart — loads global + project-scoped modules
// SessionStart hooks output context text (not block/allow decisions)
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

var ctx = hookLog.extractContext("SessionStart", input);
var modules = loadModules(path.join(__dirname, "run-modules", "SessionStart"));
var output = [];

for (var i = 0; i < modules.length; i++) {
  var modName = path.basename(modules[i], ".js");
  try {
    var mod = require(modules[i]);
    var result = mod(input);
    if (result && result.text) {
      hookLog.logHook("SessionStart", modName, "text", ctx);
      output.push(result.text);
    } else {
      hookLog.logHook("SessionStart", modName, "pass", ctx);
    }
  } catch (e) {
    hookLog.logHook("SessionStart", modName, "error", Object.assign({}, ctx, { reason: e.message }));
    process.stderr.write("hook-runner SessionStart " + modName + " error: " + e.message + "\n");
  }
}

if (output.length > 0) {
  process.stdout.write(output.join("\n"));
}
