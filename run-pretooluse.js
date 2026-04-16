#!/usr/bin/env node
"use strict";
// hook-runner PreToolUse — loads global + project-scoped modules
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

// WHY: Windows tools pass backslash paths — modules expect forward slashes for consistent matching.
if (input && input.tool_input && typeof input.tool_input.file_path === "string") {
  input.tool_input.file_path = input.tool_input.file_path.replace(/\\/g, "/");
}
if (input && input.tool_input && typeof input.tool_input.path === "string") {
  input.tool_input.path = input.tool_input.path.replace(/\\/g, "/");
}

// WHY: 4+ PreToolUse modules each spawn git commands independently.
// Shared context saves ~110ms per tool invocation (branch + tracking in one place).
try {
  var cp = require("child_process");
  // Read .git/HEAD directly — avoids spawning git (~40ms savings on Windows)
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var gitHead = fs.readFileSync(path.join(projectDir, ".git", "HEAD"), "utf-8").trim();
  var branch = gitHead.indexOf("ref: refs/heads/") === 0 ? gitHead.slice(16) : "";
  if (branch) {
    if (!input._git) input._git = {};
    input._git.branch = branch;
    // Check if branch tracks a remote (used by remote-tracking-gate, ~33ms savings)
    if (branch !== "main" && branch !== "master") {
      try {
        input._git.tracking = cp.execFileSync("git", ["config", "--get", "branch." + branch + ".remote"], {
          encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "pipe"], windowsHide: true
        }).trim();
      } catch (e) {
        input._git.tracking = "";
      }
    } else {
      input._git.tracking = "origin";
    }
  }
} catch (e) { /* not in a git repo — modules handle this gracefully */ }

var ctx = hookLog.extractContext("PreToolUse", input);
var modulesDir = process.env.HOOK_RUNNER_MODULES_DIR || path.join(__dirname, "run-modules");
var modules = loadModules(path.join(modulesDir, "PreToolUse"), input.tool_name);

runAsync.runModules(modules, input,
  function handleResult(modName, result, err, ms) {
    if (err) {
      hookLog.logHook("PreToolUse", modName, "error", Object.assign({}, ctx, { reason: err.message, ms: ms }));
      process.stderr.write("hook-runner PreToolUse " + modName + " error: " + err.message + "\n");
      return false;
    }
    if (result && result.decision) {
      hookLog.logHook("PreToolUse", modName, result.decision, Object.assign({}, ctx, { reason: result.reason, ms: ms }));
      process.stdout.write(JSON.stringify(result));
      process.exit(0);
    }
    hookLog.logHook("PreToolUse", modName, "pass", Object.assign({}, ctx, { ms: ms }));
    return false;
  },
  function handleDone() {
    // No output = allow
  }
);
