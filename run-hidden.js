#!/usr/bin/env node
"use strict";
// T387: Hidden-window wrapper for hook runners on Windows.
// WHY: Claude Code spawns hook commands via cmd.exe which creates visible
// console windows that steal focus. This wrapper re-spawns the actual runner
// with windowsHide:true, piping stdin/stdout/stderr through.
//
// Usage in settings.json:
//   node "$HOME/.claude/hooks/run-hidden.js" run-pretooluse.js
//
// On non-Windows platforms, this just executes the runner directly (no-op wrapper).

var cp = require("child_process");
var path = require("path");
var fs = require("fs");

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

// Read all stdin first (hook input JSON)
var chunks = [];
process.stdin.on("data", function(chunk) { chunks.push(chunk); });
process.stdin.on("end", function() {
  var stdinData = Buffer.concat(chunks);

  var child = cp.spawn(process.execPath, [runnerPath], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  child.stdin.write(stdinData);
  child.stdin.end();

  var stdout = [];
  var stderr = [];
  child.stdout.on("data", function(d) { stdout.push(d); });
  child.stderr.on("data", function(d) { stderr.push(d); });

  child.on("close", function(code) {
    if (stdout.length) process.stdout.write(Buffer.concat(stdout));
    if (stderr.length) process.stderr.write(Buffer.concat(stderr));
    process.exit(code || 0);
  });
});
