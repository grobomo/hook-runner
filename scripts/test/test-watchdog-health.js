#!/usr/bin/env node
"use strict";
// T390f: Tests for watchdog.js health log analysis
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var pass = 0, fail = 0;
function assert(ok, label) {
  if (ok) { pass++; console.log("OK: " + label); }
  else { fail++; console.log("FAIL: " + label); }
}

// Create temp hooks dir with required files for watchdog
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "watchdog-health-test-"));
var healthLog = path.join(tmpDir, "hook-health.jsonl");
var watchdogLog = path.join(tmpDir, "watchdog-log.jsonl");
var alertFile = path.join(tmpDir, ".watchdog-alert");

// Create minimal required files so other watchdog checks pass
var wcPath = path.join(tmpDir, "workflow-config.json");
fs.writeFileSync(wcPath, JSON.stringify({shtd: true, "code-quality": true, "self-improvement": true, "session-management": true, "messaging-safety": true}));

// Create required runner files
var requiredRunners = ["run-pretooluse.js", "run-posttooluse.js", "run-stop.js", "run-sessionstart.js", "run-userpromptsubmit.js", "load-modules.js", "workflow.js", "hook-log.js", "run-async.js", "workflow-cli.js", "constants.js"];
for (var i = 0; i < requiredRunners.length; i++) {
  fs.writeFileSync(path.join(tmpDir, requiredRunners[i]), "");
}

// Create required module dirs and files
var modulesDir = path.join(tmpDir, "run-modules");
fs.mkdirSync(path.join(modulesDir, "Stop"), { recursive: true });
fs.mkdirSync(path.join(modulesDir, "PreToolUse"), { recursive: true });
fs.writeFileSync(path.join(modulesDir, "Stop", "auto-continue.js"), "module.exports = function() { return null; };");
fs.writeFileSync(path.join(modulesDir, "PreToolUse", "branch-pr-gate.js"), "module.exports = function() { return null; };");

var watchdogPath = path.resolve(__dirname, "../../watchdog.js");

function runWatchdog(healthLogContent) {
  if (healthLogContent !== null) {
    fs.writeFileSync(healthLog, healthLogContent);
  } else if (fs.existsSync(healthLog)) {
    fs.unlinkSync(healthLog);
  }
  // Clean previous results
  if (fs.existsSync(alertFile)) fs.unlinkSync(alertFile);

  var result = cp.spawnSync(process.execPath, [watchdogPath, "--hooks-dir", tmpDir], {
    encoding: "utf-8",
    timeout: 10000,
    windowsHide: true
  });
  var output;
  try { output = JSON.parse(result.stdout); } catch(e) { output = null; }
  return { output: output, exit: result.status, alert: fs.existsSync(alertFile) };
}

// Test 1: Healthy log — no warnings
var healthyLog = [
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 0, stdout: 0, stderr: 0, ms: 45, signal: null}),
  JSON.stringify({ts: new Date().toISOString(), runner: "run-stop.js", exit: 1, stdout: 80, stderr: 0, ms: 100, signal: null}),
  JSON.stringify({ts: new Date().toISOString(), runner: "run-posttooluse.js", exit: 0, stdout: 0, stderr: 0, ms: 30, signal: null})
].join("\n") + "\n";

var r = runWatchdog(healthyLog);
assert(r.output && r.output.status === "healthy", "healthy log: no warnings");

// Test 2: Exit code mismatch — Stop runner writes block but exits 0
var mismatchLog = [
  JSON.stringify({ts: new Date().toISOString(), runner: "run-stop.js", exit: 0, stdout: 80, stderr: 0, ms: 45, signal: null})
].join("\n") + "\n";

r = runWatchdog(mismatchLog);
assert(r.output && r.output.failed > 0, "exit mismatch: detects exit 0 with stdout on stop runner");

// Test 3: Repeated crashes — same runner crashes 3+ times
var crashLog = [
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 1, stdout: 0, stderr: 100, ms: 5, signal: null}),
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 1, stdout: 0, stderr: 100, ms: 5, signal: null}),
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 1, stdout: 0, stderr: 100, ms: 5, signal: null})
].join("\n") + "\n";

r = runWatchdog(crashLog);
assert(r.output && r.output.failed > 0, "repeated crashes: detects 3+ crashes from same runner");

// Test 4: Stop never blocking — auto-continue installed but 0 stop blocks
var noStopBlockLog = [];
for (var si = 0; si < 10; si++) {
  noStopBlockLog.push(JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: 0, stdout: 0, stderr: 0, ms: 45, signal: null}));
  noStopBlockLog.push(JSON.stringify({ts: new Date().toISOString(), runner: "run-stop.js", exit: 0, stdout: 0, stderr: 0, ms: 45, signal: null}));
}
r = runWatchdog(noStopBlockLog.join("\n") + "\n");
assert(r.output && r.output.failed > 0, "stop never blocking: detects auto-continue installed but 0 stop blocks");

// Test 5: Timeout/signal kills
var signalLog = [
  JSON.stringify({ts: new Date().toISOString(), runner: "run-pretooluse.js", exit: null, stdout: 0, stderr: 0, ms: 5000, signal: "SIGTERM"})
].join("\n") + "\n";

r = runWatchdog(signalLog);
assert(r.output && r.output.failed > 0, "timeout: detects SIGTERM kill");

// Test 6: No health log — should still be healthy (just no runtime data)
r = runWatchdog(null);
assert(r.output && r.output.status === "healthy", "no health log: still healthy");

// Cleanup
try {
  var files = fs.readdirSync(tmpDir);
  for (var fi = 0; fi < files.length; fi++) {
    var fp = path.join(tmpDir, files[fi]);
    try {
      var st = fs.statSync(fp);
      if (st.isDirectory()) {
        // recursive delete for run-modules
        var sub = fs.readdirSync(fp);
        for (var si2 = 0; si2 < sub.length; si2++) {
          var sp = path.join(fp, sub[si2]);
          var sst = fs.statSync(sp);
          if (sst.isDirectory()) {
            var sub2 = fs.readdirSync(sp);
            for (var si3 = 0; si3 < sub2.length; si3++) fs.unlinkSync(path.join(sp, sub2[si3]));
            fs.rmdirSync(sp);
          } else {
            fs.unlinkSync(sp);
          }
        }
        fs.rmdirSync(fp);
      } else {
        fs.unlinkSync(fp);
      }
    } catch(e) {}
  }
  fs.rmdirSync(tmpDir);
} catch(e) {}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
