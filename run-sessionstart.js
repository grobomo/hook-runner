#!/usr/bin/env node
"use strict";
// hook-runner SessionStart — loads all run-modules/SessionStart/*.js
// SessionStart hooks output context text (not block/allow decisions)
var fs = require("fs");
var path = require("path");

var input = JSON.parse(fs.readFileSync(0, "utf-8"));

var dir = path.join(__dirname, "run-modules", "SessionStart");
if (!fs.existsSync(dir)) process.exit(0);

var files = fs.readdirSync(dir).filter(function(f) { return f.endsWith(".js"); }).sort();
var output = [];

for (var i = 0; i < files.length; i++) {
  try {
    var mod = require(path.join(dir, files[i]));
    var result = mod(input);
    if (result && result.text) {
      output.push(result.text);
    }
  } catch (e) {
    process.stderr.write("hook-runner SessionStart " + files[i] + " error: " + e.message + "\n");
  }
}

if (output.length > 0) {
  process.stdout.write(output.join("\n"));
}
