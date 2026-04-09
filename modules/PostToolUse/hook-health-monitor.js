// WORKFLOW: shtd
// WHY: Stop runner had exit(0) for blocks — TUI silently ignored autocontinue
// for multiple sessions. Nobody knew until the user noticed. Existing health
// checks only run at SessionStart and check static properties (files exist).
// This module checks runtime behavior: did hooks fire? Did they crash? Did
// exit codes match expected patterns?
"use strict";
var fs = require("fs");
var path = require("path");

// How many recent health log entries to check
var CHECK_WINDOW = 10;
// Crash threshold: warn if same runner crashes this many times
var CRASH_THRESHOLD = 3;

module.exports = function(input) {
  // Allow test injection of health log path
  var healthLogPath = input._test_health_log ||
    path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks", "hook-health.jsonl");

  if (!fs.existsSync(healthLogPath)) return null;

  var entries;
  try {
    var raw = fs.readFileSync(healthLogPath, "utf-8").trim();
    if (!raw) return null;
    var lines = raw.split("\n");
    // Only check recent entries
    entries = lines.slice(-CHECK_WINDOW).map(function(line) {
      try { return JSON.parse(line); } catch(e) { return null; }
    }).filter(Boolean);
  } catch(e) { return null; }

  if (entries.length === 0) return null;

  var warnings = [];

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];

    // Check 1: Crash detection — non-zero exit with no stdout (not a block)
    // A legitimate block: exit non-zero + stdout has JSON
    // A crash: exit non-zero + no stdout
    if (e.exit !== 0 && e.exit !== null && e.stdout === 0 && e.stderr > 0) {
      // Only warn on the most recent entry to avoid repeated warnings
      if (i === entries.length - 1) {
        warnings.push("CRASH: " + e.runner + " exited " + e.exit + " with no stdout (stderr: " + e.stderr + " bytes). Runner may have thrown an unhandled error.");
      }
    }

    // Check 2: Exit code mismatch — stdout has content (block JSON) but exit 0
    // For Stop and PostToolUse runners, block = exit(1). Exit(0) with stdout
    // means the block was written but TUI will ignore it.
    // PreToolUse legitimately uses exit(0) with block JSON.
    if (e.exit === 0 && e.stdout > 0 && e.runner !== "run-pretooluse.js") {
      if (i === entries.length - 1) {
        warnings.push("EXIT MISMATCH: " + e.runner + " wrote " + e.stdout + " bytes to stdout but exited 0. Block results will be silently ignored by the TUI. Fix: use process.exit(1) for blocks.");
      }
    }

    // Check 4: Timeout/signal — runner was killed
    if (e.signal) {
      if (i === entries.length - 1) {
        warnings.push("KILLED: " + e.runner + " received " + e.signal + " after " + e.ms + "ms. Hook may be timing out.");
      }
    }
  }

  // Check 5: Repeated crashes — same runner crashed 3+ times in window
  var crashCounts = {};
  for (var j = 0; j < entries.length; j++) {
    var ej = entries[j];
    if (ej.exit !== 0 && ej.exit !== null && ej.stdout === 0 && ej.stderr > 0) {
      crashCounts[ej.runner] = (crashCounts[ej.runner] || 0) + 1;
    }
  }
  var crashRunners = Object.keys(crashCounts);
  for (var k = 0; k < crashRunners.length; k++) {
    if (crashCounts[crashRunners[k]] >= CRASH_THRESHOLD) {
      warnings.push("REPEATED CRASH: " + crashRunners[k] + " crashed " + crashCounts[crashRunners[k]] + " times in last " + entries.length + " entries. Persistent failure — check module load errors.");
    }
  }

  if (warnings.length === 0) return null;

  // PostToolUse is non-blocking — warn via stderr
  process.stderr.write("hook-health-monitor: " + warnings.length + " issue(s):\n");
  for (var wi = 0; wi < warnings.length; wi++) {
    process.stderr.write("  - " + warnings[wi] + "\n");
  }

  // Return as text warning (non-blocking feedback to Claude)
  return { text: "HOOK HEALTH WARNING:\n" + warnings.join("\n") };
};
