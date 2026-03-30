#!/usr/bin/env node
"use strict";
// hook-runner UserPromptSubmit — loads global + project-scoped modules
// UserPromptSubmit hooks fire after user sends a prompt, before Claude processes it.
// Can block (reject prompt) or return modified prompt text.
// Supports both sync and async modules (async awaited with 4s timeout)
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

var ctx = hookLog.extractContext("UserPromptSubmit", input);
var modules = loadModules(path.join(__dirname, "run-modules", "UserPromptSubmit"));

runAsync.runModules(modules, input,
  function handleResult(modName, result, err) {
    if (err) {
      hookLog.logHook("UserPromptSubmit", modName, "error", Object.assign({}, ctx, { reason: err.message }));
      process.stderr.write("hook-runner UserPromptSubmit " + modName + " error: " + err.message + "\n");
      return false;
    }
    if (result && result.decision) {
      hookLog.logHook("UserPromptSubmit", modName, result.decision, Object.assign({}, ctx, { reason: result.reason }));
      process.stdout.write(JSON.stringify(result));
      process.exit(0);
    }
    hookLog.logHook("UserPromptSubmit", modName, "pass", ctx);
    return false;
  },
  function handleDone() {
    // No output = allow
  }
);
