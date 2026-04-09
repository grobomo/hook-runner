#!/usr/bin/env node
"use strict";
// T387/T391a: Hidden-window wrapper for hook runners on Windows.
// WHY: Claude Code spawns hook commands via cmd.exe which creates visible
// console windows that steal focus. This wrapper re-spawns the actual runner
// with windowsHide:true using spawnSync so no orphan processes remain.
// (Async spawn left orphans → Claude ran taskkill → visible popup. spawnSync
// ensures the entire child tree is dead before returning.)
//
// Usage in settings.json:
//   node "$HOME/.claude/hooks/run-hidden.js" run-pretooluse.js
//
// On non-Windows platforms, this just executes the runner directly (no-op wrapper).
// Output logged to ~/.system-monitor/hook-output.log for debugging.

var cp = require("child_process");
var path = require("path");
var fs = require("fs");
var os = require("os");

var runnerName = process.argv[2];
if (!runnerName) {
  process.stderr.write("run-hidden: missing runner argument\n");
  process.exit(0);
}

var runnerPath = path.join(__dirname, runnerName);
if (!fs.existsSync(runnerPath)) {
  process.stderr.write("run-hidden: runner not found: " + runnerPath + "\n");
  process.exit(0);
}

// Read all stdin synchronously (hook input JSON)
var stdinData;
try {
  stdinData = fs.readFileSync(0); // fd 0 = stdin
} catch (e) {
  stdinData = Buffer.alloc(0);
}

var startMs = Date.now();
var result = cp.spawnSync(process.execPath, [runnerPath], {
  input: stdinData,
  windowsHide: true,
  maxBuffer: 10 * 1024 * 1024,
  timeout: 30000
});

// T390: Log invocation to hook-health.jsonl for runtime health monitoring
var stdoutLen = result.stdout ? result.stdout.length : 0;
var stderrLen = result.stderr ? result.stderr.length : 0;
var ms = Date.now() - startMs;
try {
  var healthEntry = JSON.stringify({
    ts: new Date().toISOString(),
    runner: runnerName,
    exit: result.status,
    stdout: stdoutLen,
    stderr: stderrLen,
    ms: ms,
    signal: result.signal || null
  }) + "\n";
  fs.appendFileSync(path.join(__dirname, "hook-health.jsonl"), healthEntry);
} catch (e) {
  // health logging is best-effort — never fail the hook
}

// Log output for debugging (CMD windows flash too fast to read)
var logDir = path.join(os.homedir(), ".system-monitor");
try {
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  var logLine = new Date().toISOString() + " " + runnerName +
    " exit=" + (result.status !== null ? result.status : "signal:" + result.signal) +
    (result.stderr && stderrLen > 0 ? " stderr=" + result.stderr.toString("utf8").slice(0, 200).replace(/\n/g, "\\n") : "") +
    "\n";
  fs.appendFileSync(path.join(logDir, "hook-output.log"), logLine);
} catch (e) {
  // logging is best-effort — never fail the hook
}

// Relay stdout/stderr to Claude Code
if (result.stdout && result.stdout.length > 0) {
  process.stdout.write(result.stdout);
}
if (result.stderr && result.stderr.length > 0) {
  process.stderr.write(result.stderr);
}

process.exit(result.status || 0);
