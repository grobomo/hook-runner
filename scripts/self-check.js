#!/usr/bin/env node
// Self-check: verifies session health. Runs at session end or on demand.
// Checks: all stops fired, no fix-break cycles, frustration aligned.
// Reports: what went right, what went wrong, what gates to add/fix.
//
// Usage: node scripts/self-check.js [--last N] [--json] [--strict]
//   --last N     Check last N minutes (default 120)
//   --json       Output JSON verdict instead of human-readable
//   --strict     Return exit 1 on any failure (for CI/automation)
"use strict";

var fs = require("fs");
var path = require("path");

var HOME = process.env.HOME || "/home/ubu";
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var HOOK_LOG = path.join(HOOKS_DIR, "hook-log.jsonl");
var FRUSTRATION_LOG = path.join(HOOKS_DIR, "frustration-log.jsonl");

var args = process.argv.slice(2);
var jsonMode = args.indexOf("--json") !== -1;
var strict = args.indexOf("--strict") !== -1;
var lastMinutes = 120;
var lastIdx = args.indexOf("--last");
if (lastIdx !== -1 && args[lastIdx + 1]) lastMinutes = parseInt(args[lastIdx + 1]);

var cutoff = Date.now() - (lastMinutes * 60 * 1000);

// === Gather data ===

// 1. Hook log events
var hookEvents = [];
try {
  var lines = fs.readFileSync(HOOK_LOG, "utf-8").trim().split("\n");
  for (var i = lines.length - 1; i >= 0; i--) {
    try {
      var e = JSON.parse(lines[i]);
      if (!e.ts) continue;
      if (new Date(e.ts).getTime() < cutoff) break;
      hookEvents.unshift(e);
    } catch (ex) {}
  }
} catch (e) {}

// 2. Stop events
var stopEvents = hookEvents.filter(function(e) { return e.event === "Stop"; });
var upsEvents = hookEvents.filter(function(e) { return e.event === "UserPromptSubmit"; });

// 3. Turn tracking — detect missing stops
var turnGaps = 0;
try {
  var turnMarker = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, ".last-turn-start"), "utf-8"));
  var stopMarker = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR, ".last-stop-fired"), "utf-8"));
  if (turnMarker.session === stopMarker.session && turnMarker.turn > 1) {
    turnGaps = (turnMarker.turn - 1) - stopMarker.turn;
    if (turnGaps < 0) turnGaps = 0;
  }
} catch (e) {}

// 4. Fix-break cycles (same module blocks twice within 2min)
var fixBreakCycles = [];
var blocksByModule = {};
hookEvents.forEach(function(e) {
  if (e.result === "block" && e.event === "PreToolUse") {
    var mod = e.module || "unknown";
    if (!blocksByModule[mod]) blocksByModule[mod] = [];
    blocksByModule[mod].push(e);
  }
});
Object.keys(blocksByModule).forEach(function(mod) {
  var blocks = blocksByModule[mod];
  for (var bi = 1; bi < blocks.length; bi++) {
    var gap = new Date(blocks[bi].ts).getTime() - new Date(blocks[bi - 1].ts).getTime();
    if (gap < 120000 && gap > 5000) {
      fixBreakCycles.push({ module: mod, gap: Math.round(gap / 1000) });
    }
  }
});

// 5. Frustration signals
var frustrations = [];
try {
  var frustLines = fs.readFileSync(FRUSTRATION_LOG, "utf-8").trim().split("\n");
  for (var fi = frustLines.length - 1; fi >= 0; fi--) {
    try {
      var fe = JSON.parse(frustLines[fi]);
      if (fe.ts && new Date(fe.ts).getTime() >= cutoff) frustrations.push(fe);
      else break;
    } catch (ex) {}
  }
} catch (e) {}

// 6. Stop outcomes
var stopBlocks = stopEvents.filter(function(e) { return e.result === "block"; });
var stopErrors = stopEvents.filter(function(e) { return e.result === "error" || e.result === "haiku_fail"; });

// === Verdicts ===
var checks = [];

// Check 1: Stops fired
if (upsEvents.length > 0 && stopEvents.length === 0) {
  checks.push({ name: "stops-fired", pass: false, detail: "0 stops fired for " + upsEvents.length + " turns" });
} else if (turnGaps > 0) {
  checks.push({ name: "stops-fired", pass: false, detail: turnGaps + " turn(s) had no stop fire" });
} else {
  checks.push({ name: "stops-fired", pass: true, detail: stopEvents.length + " stops for " + upsEvents.length + " turns" });
}

// Check 2: No stop errors
if (stopErrors.length > 2) {
  checks.push({ name: "stop-health", pass: false, detail: stopErrors.length + " stop errors (proxy down or timeouts)" });
} else {
  checks.push({ name: "stop-health", pass: true, detail: stopErrors.length + " errors (acceptable)" });
}

// Check 3: No fix-break cycles
if (fixBreakCycles.length > 3) {
  checks.push({ name: "fix-break", pass: false, detail: fixBreakCycles.length + " cycles: " + fixBreakCycles.slice(0, 3).map(function(c) { return c.module + "(" + c.gap + "s)"; }).join(", ") });
} else {
  checks.push({ name: "fix-break", pass: true, detail: fixBreakCycles.length + " cycles (below threshold)" });
}

// Check 4: No user frustration
if (frustrations.length > 2) {
  var cats = {};
  frustrations.forEach(function(f) { cats[f.category] = (cats[f.category] || 0) + 1; });
  checks.push({ name: "user-satisfaction", pass: false, detail: frustrations.length + " frustration signals: " + Object.keys(cats).map(function(k) { return k + "(" + cats[k] + ")"; }).join(", ") });
} else {
  checks.push({ name: "user-satisfaction", pass: true, detail: frustrations.length + " signals (within tolerance)" });
}

// Check 5: Mandate effectiveness (if mandates issued, were they followed?)
var mandateIssued = hookEvents.filter(function(e) { return e.module === "mandate-gate" && e.result === "block"; });
var mandateTotal = hookEvents.filter(function(e) { return e.module === "mandate-gate"; });
if (mandateIssued.length > 5) {
  checks.push({ name: "mandate-compliance", pass: false, detail: mandateIssued.length + "/" + mandateTotal.length + " mandate blocks — Opus may be ignoring directives" });
} else {
  checks.push({ name: "mandate-compliance", pass: true, detail: mandateIssued.length + " mandates issued, " + mandateTotal.length + " total checks" });
}

// === Haiku deep analysis (only when non-json) ===
var haikuVerdict = null;
if (!jsonMode && stopEvents.length > 0) {
  try {
    var haiku = require(path.join(HOOKS_DIR, "haiku-client"));
    var stopReasons = stopBlocks.slice(-5).map(function(e) { return (e.reason || "").slice(0, 100); });
    var prompt = [
      "Session self-check. Evaluate if the Haiku stop decisions aligned with good session behavior.",
      "",
      "Stats: " + upsEvents.length + " turns, " + stopEvents.length + " stops, " + turnGaps + " gaps, " + fixBreakCycles.length + " fix-break cycles, " + frustrations.length + " frustrations",
      "",
      "Last 5 stop reasons:",
      stopReasons.join("\n") || "None",
      "",
      "Respond JSON: {\"aligned\":true/false, \"score\":0-100, \"concern\":\"one sentence or null\"}"
    ].join("\n");

    var result = haiku.call({ prompt: prompt, caller: "self-check", maxTokens: 200, timeoutMs: 10000, jsonMode: true });
    if (result.ok && result.parsed) haikuVerdict = result.parsed;
  } catch (e) {}
}

// === Output ===
var allPassed = checks.every(function(c) { return c.pass; });
var verdict = allPassed ? "PASS" : "FAIL";

if (jsonMode) {
  var output = {
    verdict: verdict,
    window: lastMinutes + "min",
    ts: new Date().toISOString(),
    checks: checks,
    haiku: haikuVerdict
  };
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
} else {
  console.log("=== SELF-CHECK: " + verdict + " (last " + lastMinutes + " min) ===");
  console.log("");
  checks.forEach(function(c) {
    console.log("  " + (c.pass ? "PASS" : "FAIL") + " " + c.name + " — " + c.detail);
  });
  if (haikuVerdict) {
    console.log("");
    console.log("  Haiku alignment: " + (haikuVerdict.aligned ? "YES" : "NO") + " (score: " + (haikuVerdict.score || "?") + "/100)");
    if (haikuVerdict.concern) console.log("  Concern: " + haikuVerdict.concern);
  }
  console.log("");
  if (!allPassed) {
    console.log("RECOMMENDATIONS:");
    checks.filter(function(c) { return !c.pass; }).forEach(function(c) {
      if (c.name === "stops-fired") console.log("  - Check proxy at :4100, verify settings.json timeout >= 30s");
      if (c.name === "stop-health") console.log("  - Proxy may be down or haiku timing out; restart with: pkill -f llm-token-tracker && sleep 2 && cd ~/Documents/ProjectsCL1/MCP/llm-token-tracker && node build/index.js &");
      if (c.name === "fix-break") console.log("  - Review gates causing cycles: " + fixBreakCycles.slice(0, 3).map(function(c2) { return c2.module; }).join(", "));
      if (c.name === "user-satisfaction") console.log("  - Review frustration-log.jsonl for patterns; build gates to prevent recurrence");
      if (c.name === "mandate-compliance") console.log("  - Mandate text may be unclear; review auto-continue-gate mandate wording");
    });
  }
}

// Write latest result for other tools to read
try {
  fs.writeFileSync(path.join(HOOKS_DIR, "self-check-latest.json"), JSON.stringify({
    verdict: verdict, ts: new Date().toISOString(), checks: checks, haiku: haikuVerdict
  }));
} catch (e) {}

if (strict && !allPassed) process.exit(1);
