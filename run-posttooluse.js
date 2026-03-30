#!/usr/bin/env node
"use strict";
// hook-runner PostToolUse — loads global + project-scoped modules
var fs = require("fs");
var path = require("path");
var loadModules = require("./load-modules");

var input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf-8"));
} catch (e) {
  process.exit(0);
}

var modules = loadModules(path.join(__dirname, "run-modules", "PostToolUse"));

for (var i = 0; i < modules.length; i++) {
  try {
    var mod = require(modules[i]);
    var result = mod(input);
    if (result && result.decision) {
      process.stdout.write(JSON.stringify(result));
      process.exit(0);
    }
  } catch (e) {
    process.stderr.write("hook-runner PostToolUse " + path.basename(modules[i]) + " error: " + e.message + "\n");
  }
}
