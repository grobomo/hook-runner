#!/usr/bin/env node
"use strict";
// hook-runner SessionStart — loads global + project-scoped modules
// SessionStart hooks output context text (not block/allow decisions)
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

var ctx = hookLog.extractContext("SessionStart", input);
var modulesDir = process.env.HOOK_RUNNER_MODULES_DIR || path.join(__dirname, "run-modules");
var modules = loadModules(path.join(modulesDir, "SessionStart"));
var output = [];

runAsync.runModules(modules, input,
  function handleResult(modName, result, err, ms) {
    if (err) {
      hookLog.logHook("SessionStart", modName, "error", Object.assign({}, ctx, { reason: err.message, ms: ms }));
      process.stderr.write("hook-runner SessionStart " + modName + " error: " + err.message + "\n");
      return false;
    }
    if (result && result.text) {
      hookLog.logHook("SessionStart", modName, "text", Object.assign({}, ctx, { ms: ms }));
      output.push(result.text);
    } else {
      hookLog.logHook("SessionStart", modName, "pass", Object.assign({}, ctx, { ms: ms }));
    }
    return false; // never stop — collect all text
  },
  function handleDone() {
    if (output.length > 0) {
      process.stdout.write(output.join("\n"));
    }
  }
);
