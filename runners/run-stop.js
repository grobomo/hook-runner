#!/usr/bin/env node
"use strict";
// hook-runner Stop — ordered execution: haiku gates → mechanical gates → background
//
// T667 Architecture:
//   1-haiku/    — Semantic LLM gates. Run FIRST. ALWAYS exit 1 (visible in TUI).
//                 Decision encoded in block reason (DONE/CONTINUE/NEXT/DISPATCH).
//   2-mechanical/ — Pure regex safety guards. Run ONLY if haiku said DONE.
//                   Can override DONE for hard safety rules.
//   Top-level   — Observational/background modules. Fire-and-forget.
//
// Backwards compatible: if 1-haiku/ doesn't exist, uses legacy flat loading.

var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var loadModules = require("./load-modules");
var hookLog = require("./hook-log");
var hookDebug = require("./hook-debug");

// Read input: HOOK_INPUT_FILE (from run-hidden.js) avoids Windows pipe deadlock
var input;
try {
  var raw = process.env.HOOK_INPUT_FILE
    ? fs.readFileSync(process.env.HOOK_INPUT_FILE, "utf-8")
    : fs.readFileSync(0, "utf-8");
  input = JSON.parse(raw);
} catch (e) {
  var errMsg = "SELF-CHECK [infra-safety-net]: CONTINUE — run-stop.js failed to parse input: " + e.message + ". HOOK_INPUT_FILE=" + (process.env.HOOK_INPUT_FILE || "unset");
  process.stdout.write(JSON.stringify({ decision: "block", reason: errMsg }));
  process.stderr.write(errMsg + "\n");
  process.exit(1);
}
// T759: Re-entrant guard — exit 0 to break the loop (re-entries are noise, not signal)
if (input.stop_hook_active) {
  process.exit(0);
}

// Propagate session_id from input to env if not already set (Claude Code passes it in JSON, not env)
if (input.session_id && !process.env.CLAUDE_SESSION_ID) {
  process.env.CLAUDE_SESSION_ID = input.session_id;
}

// T740: Write input JSON for debugging (always — small file, overwritten each stop)
var HOOKS_DIR_PATH = path.join(process.env.HOME || process.env.USERPROFILE || "/home/ubu", ".claude", "hooks");
try {
  var debugInput = { keys: Object.keys(input), lengths: {} };
  for (var k in input) { debugInput.lengths[k] = typeof input[k] === "string" ? input[k].length : typeof input[k]; }
  debugInput.ts = new Date().toISOString();
  debugInput.session = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
  fs.writeFileSync(path.join(HOOKS_DIR_PATH, ".last-stop-input.json"), JSON.stringify(debugInput, null, 2));
} catch (e) {}

// T741: Write full input to debug dir when debug mode is active
hookDebug.writeInput("Stop", input);

// Write stop-fired marker with turn number for T726 detection (T755: session-scoped)
var sessionId = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
try {
  var turnData = JSON.parse(fs.readFileSync(path.join(HOOKS_DIR_PATH, ".last-turn-start-" + sessionId), "utf-8"));
  var turn = (turnData.session === sessionId) ? turnData.turn : 0;
  fs.writeFileSync(path.join(HOOKS_DIR_PATH, ".last-stop-fired-" + sessionId), JSON.stringify({ session: sessionId, turn: turn, ts: new Date().toISOString() }));
} catch (e) {
  fs.writeFileSync(path.join(HOOKS_DIR_PATH, ".last-stop-fired-" + sessionId), JSON.stringify({ session: sessionId, turn: 0, ts: new Date().toISOString() }));
}

var ctx = hookLog.extractContext("Stop", input);
var modulesDir = process.env.HOOK_RUNNER_MODULES_DIR || path.join(__dirname, "run-modules");
var stopDir = path.join(modulesDir, "Stop");
var haikuDir = path.join(stopDir, "1-haiku");
var mechDir = path.join(stopDir, "2-mechanical");

// Write analysis file so TUI and next session can see haiku's reasoning
var sessionPrefix = (process.env.CLAUDE_SESSION_ID || "unknown").slice(0, 8);
var analysisPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks", "stop-analysis-" + sessionPrefix + ".md");

function runModule(modPath) {
  var modName = path.basename(modPath, ".js");
  hookDebug.traceModuleStart("Stop", modName);
  var startMs = Date.now();
  try {
    var mod = require(modPath);
    var result = mod(input);
    var ms = Date.now() - startMs;
    if (result && result.decision === "block") {
      hookLog.logHook("Stop", modName, "block", Object.assign({}, ctx, { reason: result.reason, ms: ms }));
      hookDebug.traceModuleEnd("Stop", modName, result, ms);
      return { module: modName, reason: result.reason, ms: ms };
    }
    hookLog.logHook("Stop", modName, "pass", Object.assign({}, ctx, { ms: ms }));
    hookDebug.traceModuleEnd("Stop", modName, null, ms);
    return null;
  } catch (e) {
    var ms = Date.now() - startMs;
    hookLog.logHook("Stop", modName, "error", Object.assign({}, ctx, { reason: e.message, ms: ms }));
    hookDebug.traceModuleError("Stop", modName, e.message, ms);
    return null;
  }
}

function parseHaikuDecision(reason) {
  if (!reason) return "UNKNOWN";
  var match = reason.match(/SELF-CHECK\s*\[[^\]]*\]:\s*(DONE|CONTINUE|NEXT|DISPATCH)/);
  if (match) return match[1];
  if (/\bDONE\b/.test(reason) && /you may stop/i.test(reason)) return "DONE";
  if (/\bCONTINUE\b/.test(reason)) return "CONTINUE";
  return "UNKNOWN";
}

// T804: Decision priority — higher index wins conflicts
var DECISION_PRIORITY = { "UNKNOWN": 0, "DISPATCH": 1, "DONE": 2, "NEXT": 3, "CONTINUE": 4, "CORRECT": 5 };

// --- New architecture: ordered subdirectories ---
if (fs.existsSync(haikuDir)) {
  var blocks = [];

  // Phase 1: Run haiku gates (semantic analysis, always first)
  var haikuModules = loadModules(haikuDir);
  var haikuDecision = "UNKNOWN";
  var allDecisions = []; // T804: track ALL decisions for conflict detection

  for (var i = 0; i < haikuModules.length; i++) {
    var result = runModule(haikuModules[i]);
    if (result) {
      blocks.push(result);
      var decision = parseHaikuDecision(result.reason);
      var modName = path.basename(haikuModules[i], ".js");
      if (decision !== "UNKNOWN") {
        allDecisions.push({ rule: modName, verdict: decision, reason: (result.reason || "").substring(0, 120) });
        // T804: Higher priority decision wins (CORRECT > CONTINUE > NEXT > DONE > DISPATCH)
        if ((DECISION_PRIORITY[decision] || 0) > (DECISION_PRIORITY[haikuDecision] || 0)) {
          haikuDecision = decision;
        }
      }
    }
  }

  // T804: Detect and log conflicts between haiku decisions
  if (allDecisions.length > 1) {
    var uniqueVerdicts = {};
    for (var di = 0; di < allDecisions.length; di++) {
      uniqueVerdicts[allDecisions[di].verdict] = true;
    }
    var hasConflict = Object.keys(uniqueVerdicts).length > 1;
    var conflictEntry = {
      ts: new Date().toISOString(),
      event: "Stop",
      module: "decision-conflict",
      result: hasConflict ? "conflict" : "agree",
      decisions: allDecisions,
      winner: haikuDecision
    };
    try { fs.appendFileSync(hookLog.LOG_PATH, JSON.stringify(conflictEntry) + "\n"); } catch (e) {}

    if (hasConflict) {
      var conflictMsg = "[decision-conflict] " + allDecisions.length + " rules disagree. ";
      for (var ci = 0; ci < allDecisions.length; ci++) {
        conflictMsg += allDecisions[ci].rule + "=" + allDecisions[ci].verdict + " ";
      }
      conflictMsg += "| Winner: " + haikuDecision + " (priority: CORRECT>CONTINUE>NEXT>DONE)";
      process.stderr.write(conflictMsg + "\n");
    }
  }

  // Phase 2: If haiku said DONE, run mechanical gates (safety override)
  if (haikuDecision === "DONE" && fs.existsSync(mechDir)) {
    var mechModules = loadModules(mechDir);
    for (var mi = 0; mi < mechModules.length; mi++) {
      var mechResult = runModule(mechModules[mi]);
      if (mechResult) {
        blocks.push(mechResult);
      }
    }
  }

  // T738: Stop health report — if NO module blocked, force a diagnostic block
  if (blocks.length === 0) {
    var healthReason = "SELF-CHECK [stop-health-report]: CONTINUE — No stop module produced a block result. " +
      "Haiku modules loaded: " + haikuModules.length + " (" + haikuModules.map(function(p) { return path.basename(p, ".js"); }).join(", ") + "). " +
      "All returned null/pass. Investigate: (1) check auto-continue-gate.js for early-return bugs, " +
      "(2) verify haiku-client.js auth (curl -s http://127.0.0.1:4100/health), " +
      "(3) check .last-stop-input.json for what input was received.";
    blocks.push({ module: "stop-health-report", reason: healthReason, ms: 0 });
    hookLog.logHook("Stop", "stop-health-report", "block", Object.assign({}, ctx, { reason: "no-module-blocked", ms: 0 }));
    process.stderr.write("[stop-health-report] " + healthReason + "\n");
  }

  // Phase 3: Load top-level modules for background processing
  var topLevelModules = loadModules(stopDir);
  var bgPaths = [];
  for (var ti = 0; ti < topLevelModules.length; ti++) {
    if (!loadModules.isBlocking(topLevelModules[ti])) {
      bgPaths.push(topLevelModules[ti]);
    }
  }

  // Write analysis
  if (blocks.length > 0) {
    var analysis = ["# Stop Analysis — " + new Date().toISOString(), ""];
    for (var bi = 0; bi < blocks.length; bi++) {
      analysis.push("## " + blocks[bi].module + " (" + blocks[bi].ms + "ms)");
      analysis.push(blocks[bi].reason);
      analysis.push("");
    }
    try { fs.writeFileSync(analysisPath, analysis.join("\n"), "utf-8"); } catch (e) {}
  }

  // Output: prefer haiku block, then mechanical override
  if (blocks.length > 0) {
    var bestBlock = blocks[0];
    // If mechanical gates overrode DONE, prefer the mechanical reason
    var haikuBlockCount = 0;
    for (var hc = 0; hc < blocks.length; hc++) {
      if (hc < haikuModules.length) haikuBlockCount++;
      else break;
    }
    if (haikuDecision === "DONE" && blocks.length > haikuBlockCount) {
      bestBlock = blocks[haikuBlockCount];
    }
    process.stdout.write(JSON.stringify({ decision: "block", reason: bestBlock.reason }));
    var summary = blocks.map(function(b) { return "[" + b.module + "] " + b.reason; }).join("\n");
    process.stderr.write(summary + "\n");
  }

  // Spawn background worker
  if (bgPaths.length > 0) {
    var tmpFile = path.join(require("os").tmpdir(), "stop-bg-" + process.pid + ".json");
    try {
      fs.writeFileSync(tmpFile, JSON.stringify({ input: input, modules: bgPaths, ctx: ctx }));
      cp.spawn(process.execPath, [path.join(__dirname, "run-stop-bg.js"), tmpFile], {
        detached: true, stdio: "ignore", windowsHide: true
      }).unref();
    } catch(e) {
      process.stderr.write("hook-runner Stop bg: " + e.message + "\n");
    }
  }

  // T759: ALWAYS exit 1 — user directive: stop hook must always be visible in TUI
  process.exit(1);

} else {
  // --- Legacy flat architecture (backwards compatible) ---
  var LEGACY_BLOCKING = ["auto-continue", "never-give-up"];
  var modulePaths = loadModules(stopDir);
  var legacyBlocks = [];
  var legacyBgPaths = [];

  for (var li = 0; li < modulePaths.length; li++) {
    var modPath = modulePaths[li];
    var modName = path.basename(modPath, ".js");

    if (loadModules.isBlocking(modPath) || LEGACY_BLOCKING.indexOf(modName) !== -1) {
      var startMs = Date.now();
      try {
        var mod = require(modPath);
        var legacyResult = mod(input);
        var ms = Date.now() - startMs;
        if (legacyResult && legacyResult.decision === "block") {
          hookLog.logHook("Stop", modName, "block", Object.assign({}, ctx, { reason: legacyResult.reason, ms: ms }));
          legacyBlocks.push({ module: modName, reason: legacyResult.reason, ms: ms });
        } else {
          hookLog.logHook("Stop", modName, "pass", Object.assign({}, ctx, { ms: ms }));
        }
      } catch (e) {
        hookLog.logHook("Stop", modName, "error", Object.assign({}, ctx, { reason: e.message, ms: Date.now() - startMs }));
      }
    } else {
      legacyBgPaths.push(modPath);
    }
  }

  if (legacyBlocks.length > 0) {
    var legacyAnalysis = ["# Stop Analysis — " + new Date().toISOString(), ""];
    for (var lbi = 0; lbi < legacyBlocks.length; lbi++) {
      legacyAnalysis.push("## " + legacyBlocks[lbi].module + " (" + legacyBlocks[lbi].ms + "ms)");
      legacyAnalysis.push(legacyBlocks[lbi].reason);
      legacyAnalysis.push("");
    }
    try { fs.writeFileSync(analysisPath, legacyAnalysis.join("\n"), "utf-8"); } catch (e) {}
  }

  var HAIKU_GATES = ["stop-analysis-gate", "auto-continue-gate"];
  if (legacyBlocks.length > 0) {
    var legacyBest = legacyBlocks[0];
    for (var pi = 0; pi < legacyBlocks.length; pi++) {
      if (HAIKU_GATES.indexOf(legacyBlocks[pi].module) !== -1) { legacyBest = legacyBlocks[pi]; break; }
    }
    if (HAIKU_GATES.indexOf(legacyBest.module) === -1) {
      for (var ri = 0; ri < legacyBlocks.length; ri++) {
        if (legacyBlocks[ri].reason && legacyBlocks[ri].reason.length > 50) { legacyBest = legacyBlocks[ri]; break; }
      }
    }
    process.stdout.write(JSON.stringify({ decision: "block", reason: legacyBest.reason }));
    var legacySummary = legacyBlocks.map(function(b) { return "[" + b.module + "] " + b.reason; }).join("\n");
    process.stderr.write(legacySummary + "\n");
  }

  if (legacyBgPaths.length > 0) {
    var legacyTmpFile = path.join(require("os").tmpdir(), "stop-bg-" + process.pid + ".json");
    try {
      fs.writeFileSync(legacyTmpFile, JSON.stringify({ input: input, modules: legacyBgPaths, ctx: ctx }));
      cp.spawn(process.execPath, [path.join(__dirname, "run-stop-bg.js"), legacyTmpFile], {
        detached: true, stdio: "ignore", windowsHide: true
      }).unref();
    } catch(e) {
      process.stderr.write("hook-runner Stop bg: " + e.message + "\n");
    }
  }

  process.exit(legacyBlocks.length > 0 ? 1 : 0);
}
