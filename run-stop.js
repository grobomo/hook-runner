#!/usr/bin/env node
"use strict";
// hook-runner Stop — loads global + project-scoped modules
// T390: Only blocking modules (those that return {decision:"block"}) need to
// run synchronously. Everything else is observational and can run in background.
// Strategy: run each module with a 200ms sync budget. If it returns a block,
// great. If it takes longer or is async, defer to background worker.
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var loadModules = require("./load-modules");
var hookLog = require("./hook-log");

// Read input: HOOK_INPUT_FILE (from run-hidden.js) avoids Windows pipe deadlock
var input;
try {
  var raw = process.env.HOOK_INPUT_FILE
    ? fs.readFileSync(process.env.HOOK_INPUT_FILE, "utf-8")
    : fs.readFileSync(0, "utf-8");
  input = JSON.parse(raw);
} catch (e) {
  process.exit(0);
}
if (input.stop_hook_active) process.exit(0);

var ctx = hookLog.extractContext("Stop", input);
var modulesDir = process.env.HOOK_RUNNER_MODULES_DIR || path.join(__dirname, "run-modules");
var modulePaths = loadModules(path.join(modulesDir, "Stop"));

// T639: Modules declare themselves blocking with "// BLOCKING: true" in the header.
// These run synchronously so their block/pass is visible in the TUI.
// Everything else goes to a detached background worker.
// Legacy fallback: known module names that predate the BLOCKING tag.
var LEGACY_BLOCKING = ["auto-continue", "never-give-up"];

var blocks = [];
var bgPaths = [];

// Write analysis file so TUI and next session can see haiku's reasoning
var analysisPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks", "stop-analysis.md");

for (var i = 0; i < modulePaths.length; i++) {
  var modPath = modulePaths[i];
  var modName = path.basename(modPath, ".js");

  if (loadModules.isBlocking(modPath) || LEGACY_BLOCKING.indexOf(modName) !== -1) {
    // Run sync — all blocking modules run, not just first
    var startMs = Date.now();
    try {
      var mod = require(modPath);
      var result = mod(input);
      var ms = Date.now() - startMs;
      if (result && result.decision === "block") {
        hookLog.logHook("Stop", modName, "block", Object.assign({}, ctx, { reason: result.reason, ms: ms }));
        blocks.push({ module: modName, reason: result.reason, ms: ms });
      } else {
        hookLog.logHook("Stop", modName, "pass", Object.assign({}, ctx, { ms: ms }));
      }
    } catch (e) {
      hookLog.logHook("Stop", modName, "error", Object.assign({}, ctx, { reason: e.message, ms: Date.now() - startMs }));
    }
  } else {
    // Defer to background
    bgPaths.push(modPath);
  }
}

// Write analysis file with all blocking results
if (blocks.length > 0) {
  var analysis = [
    "# Stop Analysis — " + new Date().toISOString(),
    ""
  ];
  for (var bi = 0; bi < blocks.length; bi++) {
    analysis.push("## " + blocks[bi].module + " (" + blocks[bi].ms + "ms)");
    analysis.push(blocks[bi].reason);
    analysis.push("");
  }
  try { fs.writeFileSync(analysisPath, analysis.join("\n"), "utf-8"); } catch (e) {}
}

// Output best block to stdout (Claude Code protocol) + all to stderr (TUI)
// Prefer stop-analysis-gate (Haiku reasoning) over static messages
if (blocks.length > 0) {
  var bestBlock = blocks[0];
  for (var pi = 0; pi < blocks.length; pi++) {
    if (blocks[pi].module === "stop-analysis-gate") { bestBlock = blocks[pi]; break; }
  }
  process.stdout.write(JSON.stringify({ decision: "block", reason: bestBlock.reason }));
  var summary = blocks.map(function(b) { return "[" + b.module + "] " + b.reason; }).join("\n");
  process.stderr.write(summary + "\n");
}

// Spawn background worker for remaining modules
if (bgPaths.length > 0) {
  var tmpFile = path.join(require("os").tmpdir(), "stop-bg-" + process.pid + ".json");
  try {
    fs.writeFileSync(tmpFile, JSON.stringify({
      input: input,
      modules: bgPaths,
      ctx: ctx
    }));
    cp.spawn(process.execPath, [path.join(__dirname, "run-stop-bg.js"), tmpFile], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
  } catch(e) {
    process.stderr.write("hook-runner Stop bg: " + e.message + "\n");
  }
}

process.exit(blocks.length > 0 ? 1 : 0);
