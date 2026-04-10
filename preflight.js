#!/usr/bin/env node
"use strict";
// T403c: Preflight check — reports enforcement status at a glance.
// Shows: active rules, recent test results, never-fired gates, pipeline health.
//
// Usage:
//   node preflight.js          # quick summary
//   node preflight.js --test   # run E2E tests then report
//   node preflight.js --json   # machine-readable output

var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var hooksDir = path.join(os.homedir(), ".claude", "hooks");
var modulesDir = path.join(hooksDir, "run-modules");
var logPath = path.join(hooksDir, "hook-log.jsonl");
var healthPath = path.join(hooksDir, "hook-health.jsonl");
var jsonMode = process.argv.indexOf("--json") !== -1;
var runTests = process.argv.indexOf("--test") !== -1;

// --- Collect data ---

// 1. Count live modules per event
var EVENTS = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];
var moduleCounts = {};
var gateNames = [];
for (var ei = 0; ei < EVENTS.length; ei++) {
  var evDir = path.join(modulesDir, EVENTS[ei]);
  if (!fs.existsSync(evDir)) { moduleCounts[EVENTS[ei]] = 0; continue; }
  var files = fs.readdirSync(evDir).filter(function(f) {
    return f.slice(-3) === ".js" && f.charAt(0) !== "_";
  });
  // Include subdirs
  var subdirs = fs.readdirSync(evDir).filter(function(d) {
    return fs.statSync(path.join(evDir, d)).isDirectory() && d !== "archive";
  });
  for (var si = 0; si < subdirs.length; si++) {
    var sf = fs.readdirSync(path.join(evDir, subdirs[si])).filter(function(f) {
      return f.slice(-3) === ".js" && f.charAt(0) !== "_";
    });
    files = files.concat(sf);
  }
  moduleCounts[EVENTS[ei]] = files.length;
  if (EVENTS[ei] === "PreToolUse") {
    gateNames = files.map(function(f) { return f.replace(/\.js$/, ""); });
  }
}

// 2. Read hook log for block stats
var blocks = {}, invocations = {}, lastBlockTime = {};
var logAge = null;
if (fs.existsSync(logPath)) {
  var logLines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
  for (var i = 0; i < logLines.length; i++) {
    try {
      var e = JSON.parse(logLines[i]);
      invocations[e.module] = (invocations[e.module] || 0) + 1;
      if (e.result === "block") {
        blocks[e.module] = (blocks[e.module] || 0) + 1;
        lastBlockTime[e.module] = e.timestamp || e.ts || "";
      }
    } catch(x) {}
  }
  // Check log age
  try {
    var firstEntry = JSON.parse(logLines[0]);
    logAge = firstEntry.timestamp || firstEntry.ts || null;
  } catch(x) {}
}

// 3. Categorize gates
var activeGates = [], preventiveGates = [], neverFired = [];
for (var gi = 0; gi < gateNames.length; gi++) {
  var gn = gateNames[gi];
  var bc = blocks[gn] || 0;
  var ic = invocations[gn] || 0;
  if (bc > 0) {
    activeGates.push({ name: gn, blocks: bc, invocations: ic, lastBlock: lastBlockTime[gn] || "" });
  } else if (ic > 100) {
    preventiveGates.push({ name: gn, invocations: ic });
  } else {
    neverFired.push({ name: gn, invocations: ic });
  }
}

// 4. Check health log for recent anomalies
var healthIssues = [];
if (fs.existsSync(healthPath)) {
  var healthLines = fs.readFileSync(healthPath, "utf-8").trim().split("\n");
  var recent = healthLines.slice(-20);
  for (var hi = 0; hi < recent.length; hi++) {
    try {
      var h = JSON.parse(recent[hi]);
      if (h.signal) healthIssues.push("Runner " + h.runner + " killed by " + h.signal);
      if (h.exit === 0 && h.stdout > 0 && h.runner !== "run-pretooluse.js") {
        healthIssues.push("Runner " + h.runner + " exit 0 with " + h.stdout + " bytes stdout (block ignored?)");
      }
    } catch(x) {}
  }
}

// 5. Check runners exist
var RUNNERS = ["run-pretooluse.js", "run-posttooluse.js", "run-sessionstart.js", "run-stop.js", "run-userpromptsubmit.js", "run-hidden.js"];
var missingRunners = [];
for (var ri = 0; ri < RUNNERS.length; ri++) {
  if (!fs.existsSync(path.join(hooksDir, RUNNERS[ri]))) {
    missingRunners.push(RUNNERS[ri]);
  }
}

// 6. Optionally run E2E tests
var e2eResult = null;
if (runTests) {
  var testPath = path.join(__dirname, "scripts", "test", "test-e2e-enforcement.js");
  if (fs.existsSync(testPath)) {
    var tr = cp.spawnSync(process.execPath, [testPath], {
      timeout: 60000,
      windowsHide: true,
      encoding: "utf-8"
    });
    e2eResult = {
      exitCode: tr.status,
      output: (tr.stdout || "").trim().split("\n").slice(-1)[0] // last line = summary
    };
  }
}

// --- Output ---

if (jsonMode) {
  process.stdout.write(JSON.stringify({
    modules: moduleCounts,
    gates: { active: activeGates, preventive: preventiveGates.length, neverFired: neverFired },
    health: { issues: healthIssues, missingRunners: missingRunners },
    e2e: e2eResult,
    logAge: logAge
  }, null, 2) + "\n");
  process.exit(0);
}

// Human-readable output
console.log("=== Hook-Runner Preflight Check ===\n");

// Status line
var totalGates = gateNames.length;
var status = missingRunners.length > 0 ? "DEGRADED" : healthIssues.length > 0 ? "WARNING" : "HEALTHY";
var statusSymbol = status === "HEALTHY" ? "OK" : status === "WARNING" ? "!!" : "XX";
console.log("[" + statusSymbol + "] System: " + status);
console.log("");

// Module counts
console.log("Modules installed:");
for (var ek = 0; ek < EVENTS.length; ek++) {
  console.log("  " + EVENTS[ek] + ": " + (moduleCounts[EVENTS[ek]] || 0));
}
console.log("");

// Gate enforcement summary
console.log("Gate enforcement (" + totalGates + " PreToolUse gates):");
console.log("  Active (blocked 1+ times): " + activeGates.length);
console.log("  Preventive (never blocked, 100+ invocations): " + preventiveGates.length);
console.log("  Never fired: " + neverFired.length);
console.log("");

// Top active gates
if (activeGates.length > 0) {
  activeGates.sort(function(a, b) { return b.blocks - a.blocks; });
  console.log("Top active gates:");
  var showCount = Math.min(activeGates.length, 10);
  for (var ti = 0; ti < showCount; ti++) {
    var ag = activeGates[ti];
    console.log("  " + ag.blocks + "x  " + ag.name);
  }
  console.log("");
}

// Never-fired warning
if (neverFired.length > 0) {
  console.log("Never-fired gates (candidates for review):");
  for (var ni = 0; ni < neverFired.length; ni++) {
    var nf = neverFired[ni];
    console.log("  " + nf.name + " (" + nf.invocations + " invocations)");
  }
  console.log("");
}

// Health issues
if (missingRunners.length > 0) {
  console.log("MISSING RUNNERS:");
  for (var mr = 0; mr < missingRunners.length; mr++) {
    console.log("  " + missingRunners[mr]);
  }
  console.log("");
}
if (healthIssues.length > 0) {
  console.log("Recent health issues:");
  for (var hii = 0; hii < healthIssues.length; hii++) {
    console.log("  " + healthIssues[hii]);
  }
  console.log("");
}

// E2E test results
if (e2eResult) {
  console.log("E2E enforcement tests: " + (e2eResult.exitCode === 0 ? "PASS" : "FAIL"));
  console.log("  " + e2eResult.output);
  console.log("");
}

// Log age
if (logAge) {
  console.log("Log data since: " + logAge);
}

process.exit(status === "DEGRADED" ? 1 : 0);
