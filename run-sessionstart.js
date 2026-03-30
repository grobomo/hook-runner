#!/usr/bin/env node
"use strict";
// hook-runner SessionStart — loads global + project-scoped modules
// SessionStart hooks output context text (not block/allow decisions)
var fs = require("fs");
var path = require("path");
var loadModules = require("./load-modules");

var input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf-8"));
} catch (e) {
  process.exit(0);
}

var modules = loadModules(path.join(__dirname, "run-modules", "SessionStart"));
var output = [];

for (var i = 0; i < modules.length; i++) {
  try {
    var mod = require(modules[i]);
    var result = mod(input);
    if (result && result.text) {
      output.push(result.text);
    }
  } catch (e) {
    process.stderr.write("hook-runner SessionStart " + path.basename(modules[i]) + " error: " + e.message + "\n");
  }
}

if (output.length > 0) {
  process.stdout.write(output.join("\n"));
}
