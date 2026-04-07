#!/usr/bin/env node
"use strict";
/**
 * hook-runner report generator
 *
 * Extracted from setup.js for maintainability.
 * Generates an HTML report of Claude Code hooks configuration.
 */
var fs = require("fs");
var path = require("path");
var os = require("os");

var HOME = os.homedir();
var SETTINGS_PATH = path.join(HOME, ".claude", "settings.json");

// ============================================================
// Report Generator
// ============================================================

// Canonical event order: user experience flow
var EVENT_ORDER = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];

var EVENT_TITLES = {
  SessionStart: "Session Start Hooks",
  UserPromptSubmit: "User Prompt Hooks",
  PreToolUse: "Pre-Tool Use Hooks",
  PostToolUse: "Post-Tool Use Hooks",
  Stop: "Stop Hooks"
};

var EVENT_BADGES = {
  SessionStart: "badge-session", PreToolUse: "badge-pre", PostToolUse: "badge-post",
  Stop: "badge-stop", UserPromptSubmit: "badge-prompt"
};

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Read the first 10 lines of a module file (cached per report generation).
 */
var _reportHeaderCache = {};
function getHeaderLines(filePath) {
  if (_reportHeaderCache[filePath]) return _reportHeaderCache[filePath];
  try {
    var content = fs.readFileSync(filePath, "utf-8");
    _reportHeaderCache[filePath] = content.split("\n").slice(0, 10);
    return _reportHeaderCache[filePath];
  } catch (e) { return []; }
}

/**
 * Read the first comment line from a module as its description.
 */
function getModuleDescription(filePath) {
  var lines = getHeaderLines(filePath);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.indexOf("//") === 0) {
      var desc = line.replace(/^\/\/\s*/, "");
      if (desc.length > 10 && !/^#!|^"use strict"|^@module|^WORKFLOW:|^WHY:|^requires:/.test(desc)) return desc;
    }
  }
  return "";
}

/**
 * Parse "// WORKFLOW: name" from a module's header lines.
 */
function getModuleWorkflow(filePath) {
  var lines = getHeaderLines(filePath);
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^\/\/\s*WORKFLOW:\s*(\S+)/i);
    if (match) return match[1];
  }
  return null;
}

/**
 * Parse "// WHY: ..." from a module's header lines.
 * May span multiple consecutive comment lines after the WHY tag.
 */
function getModuleWhy(filePath) {
  var lines = getHeaderLines(filePath);
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^\/\/\s*WHY:\s*(.+)/i);
    if (match) {
      var why = match[1].trim();
      // Collect continuation lines (comments that don't start a new tag)
      for (var j = i + 1; j < lines.length; j++) {
        var cont = lines[j].match(/^\/\/\s+([^A-Z].*)/);
        if (cont && !/^\/\/\s*(WORKFLOW|WHY|requires):/i.test(lines[j])) {
          why += " " + cont[1].trim();
        } else {
          break;
        }
      }
      return why;
    }
  }
  return null;
}

/**
 * Read the full source code of a module for display.
 */
function getModuleSource(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (e) { return ""; }
}

/**
 * Collect all modules for an event, including project-scoped and archived.
 */
function collectModules(modulesDir) {
  var result = [];
  if (!fs.existsSync(modulesDir)) return result;

  var entries = fs.readdirSync(modulesDir, { withFileTypes: true });

  // Global modules
  var globalFiles = entries.filter(function(e) { return e.isFile() && e.name.slice(-3) === ".js"; })
    .map(function(e) { return e.name; }).sort();
  for (var i = 0; i < globalFiles.length; i++) {
    var fp = path.join(modulesDir, globalFiles[i]);
    result.push({
      name: globalFiles[i], path: fp, scope: "global",
      description: getModuleDescription(fp), source: getModuleSource(fp), archived: false,
      workflow: getModuleWorkflow(fp), why: getModuleWhy(fp)
    });
  }

  // Archive modules
  var archiveDir = path.join(modulesDir, "archive");
  if (fs.existsSync(archiveDir)) {
    try {
      var archiveFiles = fs.readdirSync(archiveDir).filter(function(f) { return f.slice(-3) === ".js"; }).sort();
      for (var a = 0; a < archiveFiles.length; a++) {
        var afp = path.join(archiveDir, archiveFiles[a]);
        result.push({
          name: "archive/" + archiveFiles[a], path: afp, scope: "archived",
          description: getModuleDescription(afp), source: getModuleSource(afp), archived: true,
          workflow: getModuleWorkflow(afp), why: getModuleWhy(afp)
        });
      }
    } catch (e) { /* skip */ }
  }

  // Project-scoped modules
  var subdirs = entries.filter(function(e) { return e.isDirectory() && e.name !== "archive"; });
  for (var s = 0; s < subdirs.length; s++) {
    var subDir = path.join(modulesDir, subdirs[s].name);
    var subFiles = fs.readdirSync(subDir).filter(function(f) { return f.slice(-3) === ".js"; }).sort();
    for (var sf = 0; sf < subFiles.length; sf++) {
      var sfp = path.join(subDir, subFiles[sf]);
      result.push({
        name: subdirs[s].name + "/" + subFiles[sf], path: sfp, scope: subdirs[s].name,
        description: getModuleDescription(sfp), source: getModuleSource(sfp), archived: false,
        workflow: getModuleWorkflow(sfp), why: getModuleWhy(sfp)
      });
    }
  }

  return result;
}

/**
 * Analyze hook system using heuristic rules. Returns analysis JSON string.
 * @param {object} eventModulesData - { eventName: [{name, workflow, why, description, stats}] }
 * @param {object} hookStats - per-module stats from hook-log
 * @param {object} perfData - { event: overhead_ms } from --perf
 * @returns {string} JSON string with analysis results
 */
function analyzeHooks(eventModulesData, hookStats, perfData) {
  var result = {
    quality: { score: "A", summary: "" },
    coverage_gaps: [],
    dry_issues: [],
    performance: [],
    redundant_modules: [],
    missing_modules: [],
    top_recommendations: []
  };

  // Flatten all modules for cross-event analysis
  var allMods = [];
  var events = Object.keys(eventModulesData);
  var modsByEvent = {};
  for (var ei = 0; ei < events.length; ei++) {
    var evt = events[ei];
    var mods = eventModulesData[evt];
    modsByEvent[evt] = mods;
    for (var mi = 0; mi < mods.length; mi++) {
      allMods.push({ event: evt, name: mods[mi].name, workflow: mods[mi].workflow,
        why: mods[mi].why, description: mods[mi].description, stats: mods[mi].stats });
    }
  }

  var totalModules = allMods.length;
  var totalBlocks = 0, totalErrors = 0, totalCalls = 0;
  var sKeys = Object.keys(hookStats);
  for (var si = 0; si < sKeys.length; si++) {
    totalBlocks += hookStats[sKeys[si]].block || 0;
    totalErrors += hookStats[sKeys[si]].error || 0;
    totalCalls += hookStats[sKeys[si]].total || 0;
  }

  // --- Coverage gap detection ---
  var canonicalEvents = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"];
  for (var ce = 0; ce < canonicalEvents.length; ce++) {
    if (!modsByEvent[canonicalEvents[ce]] || modsByEvent[canonicalEvents[ce]].length === 0) {
      result.coverage_gaps.push("No modules for " + canonicalEvents[ce] + " event");
    }
  }

  // Modules missing WHY comment
  var missingWhy = [];
  for (var mw = 0; mw < allMods.length; mw++) {
    if (!allMods[mw].why) missingWhy.push(allMods[mw].name);
  }
  if (missingWhy.length > 0) {
    result.coverage_gaps.push(missingWhy.length + " module(s) missing WHY comment: " +
      missingWhy.slice(0, 5).join(", ") + (missingWhy.length > 5 ? " (+" + (missingWhy.length - 5) + " more)" : ""));
  }

  // Modules missing WORKFLOW tag
  var missingWorkflow = [];
  for (var mt = 0; mt < allMods.length; mt++) {
    if (!allMods[mt].workflow) missingWorkflow.push(allMods[mt].name);
  }
  if (missingWorkflow.length > 0) {
    result.coverage_gaps.push(missingWorkflow.length + " module(s) missing WORKFLOW tag: " +
      missingWorkflow.slice(0, 5).join(", ") + (missingWorkflow.length > 5 ? " (+" + (missingWorkflow.length - 5) + " more)" : ""));
  }

  // --- DRY detection: multiple PreToolUse modules sharing keyword stems ---
  // Skip project-scoped modules (contain "/") — they share prefixes by design
  var nameWords = {};
  for (var dw = 0; dw < allMods.length; dw++) {
    if (allMods[dw].event !== "PreToolUse") continue;
    if (allMods[dw].name.indexOf("/") !== -1) continue;
    var words = allMods[dw].name.replace(/\.js$/, "").split("-");
    for (var wi = 0; wi < words.length; wi++) {
      var w = words[wi].toLowerCase();
      // Skip generic words that appear in many unrelated module names
      var skipWords = ["check", "guard", "safety", "gate", "claude", "remote", "workflow",
        "module", "config", "project", "integrity", "monitor", "system", "detect"];
      var skip = w.length < 6;
      for (var sw = 0; !skip && sw < skipWords.length; sw++) { if (w === skipWords[sw]) skip = true; }
      if (skip) continue;
      if (!nameWords[w]) nameWords[w] = [];
      nameWords[w].push(allMods[dw].name);
    }
  }
  var wordKeys = Object.keys(nameWords);
  for (var dk = 0; dk < wordKeys.length; dk++) {
    if (nameWords[wordKeys[dk]].length >= 3) {
      result.dry_issues.push(nameWords[wordKeys[dk]].length + " PreToolUse modules share keyword '" +
        wordKeys[dk] + "': " + nameWords[wordKeys[dk]].join(", ") + " — review for consolidation");
    }
  }

  // --- DRY detection: duplicate WHY text (modules with identical purpose) ---
  // Same module in multiple events (e.g. config-sync in SessionStart + Stop) is expected — dedupe by name
  var whyMap = {};
  for (var dwy = 0; dwy < allMods.length; dwy++) {
    var whyText = allMods[dwy].why;
    if (!whyText || whyText.length < 20) continue;
    // Normalize: lowercase, strip punctuation, take first 60 chars
    var whyKey = whyText.toLowerCase().replace(/[^a-z0-9 ]/g, "").substring(0, 60).trim();
    if (!whyMap[whyKey]) whyMap[whyKey] = [];
    // Deduplicate by base module name (same module across events is expected)
    var baseName = allMods[dwy].name.replace(/\.js$/, "");
    var already = false;
    for (var ddup = 0; ddup < whyMap[whyKey].length; ddup++) {
      var existing = whyMap[whyKey][ddup];
      // Same base name in different event = same module, not a DRY issue
      if (existing.indexOf("/" + baseName) !== -1 || existing === baseName) { already = true; break; }
    }
    if (!already) whyMap[whyKey].push(allMods[dwy].event + "/" + baseName);
  }
  var whyMapKeys = Object.keys(whyMap);
  for (var dwk = 0; dwk < whyMapKeys.length; dwk++) {
    if (whyMap[whyMapKeys[dwk]].length >= 2) {
      result.dry_issues.push("Duplicate WHY across " + whyMap[whyMapKeys[dwk]].join(" and ") +
        " — likely redundant, consider merging");
    }
  }

  // --- Performance: high spike ratio (max > 50x avg, top 3 only) ---
  // Git-heavy modules naturally spike on cold calls; only flag extreme outliers
  var spikeList = [];
  for (var spi = 0; spi < allMods.length; spi++) {
    var spSt = allMods[spi].stats;
    if (spSt && spSt.msCount > 50) {
      var spAvg = Math.round(spSt.msTotal / spSt.msCount);
      var spRatio = spSt.msMax / Math.max(spAvg, 1);
      if (spAvg > 10 && spRatio > 50 && spSt.msMax > 500) {
        spikeList.push({ name: allMods[spi].name, avg: spAvg, max: spSt.msMax, ratio: Math.round(spRatio) });
      }
    }
  }
  spikeList.sort(function(a, b) { return b.ratio - a.ratio; });
  for (var spj = 0; spj < Math.min(spikeList.length, 3); spj++) {
    result.performance.push(spikeList[spj].name + " has sporadic spikes: avg " +
      spikeList[spj].avg + "ms but max " + spikeList[spj].max + "ms (" + spikeList[spj].ratio + "x)");
  }

  // --- Performance analysis ---
  // Only flag per-tool-call events as overhead concerns.
  // SessionStart/Stop run once per session — high ms is expected and not actionable.
  var perCallEvents = { PreToolUse: 1, PostToolUse: 1, UserPromptSubmit: 1 };
  if (perfData) {
    var perfKeys = Object.keys(perfData);
    for (var pk = 0; pk < perfKeys.length; pk++) {
      var ms = perfData[perfKeys[pk]];
      if (perCallEvents[perfKeys[pk]] && ms > 500) {
        result.performance.push(perfKeys[pk] + " overhead is " + ms + "ms per tool call — optimize slow modules");
      }
    }
  }

  // Slow individual modules (avg > 50ms, per-call events only)
  var slowMods = [];
  for (var sm = 0; sm < allMods.length; sm++) {
    if (!perCallEvents[allMods[sm].event]) continue;
    var st = allMods[sm].stats;
    if (st && st.msCount > 0) {
      var avg = Math.round(st.msTotal / st.msCount);
      if (avg > 50) slowMods.push({ name: allMods[sm].name, event: allMods[sm].event, avg: avg, max: st.msMax });
    }
  }
  slowMods.sort(function(a, b) { return b.avg - a.avg; });
  for (var sl = 0; sl < Math.min(slowMods.length, 5); sl++) {
    result.performance.push(slowMods[sl].name + " (" + slowMods[sl].event + ") avg " +
      slowMods[sl].avg + "ms, max " + slowMods[sl].max + "ms");
  }

  // --- Redundancy: PreToolUse gates that never block despite many invocations ---
  // Threshold 2000+ calls — low-volume gates haven't had enough exposure to judge
  // Note: some gates are preventive (user learned not to trigger them) — flag for review, not removal
  var neverTriggered = [];
  for (var nt = 0; nt < allMods.length; nt++) {
    var ntStats = allMods[nt].stats;
    if (ntStats && ntStats.total > 2000 && (ntStats.block || 0) === 0 && (ntStats.error || 0) === 0) {
      if (allMods[nt].event === "PreToolUse") {
        neverTriggered.push(allMods[nt].name + " — " + ntStats.total + " calls, 0 blocks (may be preventive)");
      }
    }
  }
  for (var nti = 0; nti < Math.min(neverTriggered.length, 5); nti++) {
    result.redundant_modules.push(neverTriggered[nti]);
  }

  // --- Error-prone modules ---
  var errorProne = [];
  for (var ep = 0; ep < allMods.length; ep++) {
    var epStats = allMods[ep].stats;
    if (epStats && epStats.error > 0 && epStats.total > 0) {
      var errorRate = Math.round(100 * epStats.error / epStats.total);
      if (errorRate > 5) {
        errorProne.push({ name: allMods[ep].name, rate: errorRate, errors: epStats.error, total: epStats.total });
      }
    }
  }
  if (errorProne.length > 0) {
    var epNames = [];
    for (var epi = 0; epi < Math.min(errorProne.length, 3); epi++) {
      epNames.push(errorProne[epi].name + " (" + errorProne[epi].rate + "%)");
    }
    result.top_recommendations.push("Fix error-prone modules: " + epNames.join("; "));
  }

  // --- Suggested modules: check for common patterns not covered ---
  var allNames = [];
  for (var an = 0; an < allMods.length; an++) allNames.push(allMods[an].name.toLowerCase());
  var allNamesStr = allNames.join(" ");
  // Check for event balance — PreToolUse-heavy systems often lack PostToolUse monitoring
  var preCount = (modsByEvent["PreToolUse"] || []).length;
  var postCount = (modsByEvent["PostToolUse"] || []).length;
  if (preCount > 10 && postCount < preCount / 4) {
    result.missing_modules.push("PostToolUse is underrepresented (" + postCount + " vs " +
      preCount + " PreToolUse) — consider adding monitoring modules for tool output validation");
  }
  // Check if there's a large file / output size gate
  if (allNamesStr.indexOf("size") === -1 && allNamesStr.indexOf("large") === -1) {
    result.missing_modules.push("No file-size gate — consider blocking Write/Edit of unusually large files");
  }

  // --- Quality score ---
  // Deterrent gates (never block) don't count as demerits — they prevent behavior proactively
  var demerits = 0;
  if (missingWhy.length > 0) demerits += Math.min(missingWhy.length, 5);
  if (missingWorkflow.length > 0) demerits += Math.min(missingWorkflow.length, 5);
  if (result.coverage_gaps.length > 2) demerits += 2;
  if (errorProne.length > 0) demerits += errorProne.length * 2;
  if (slowMods.length > 3) demerits += 1;

  if (demerits === 0) { result.quality.score = "A"; }
  else if (demerits <= 3) { result.quality.score = "B"; }
  else if (demerits <= 8) { result.quality.score = "C"; }
  else { result.quality.score = "D"; }

  result.quality.summary = totalModules + " modules, " + totalCalls + " invocations, " +
    totalBlocks + " blocks, " + totalErrors + " errors" +
    (demerits > 0 ? " (" + demerits + " demerits)" : "");

  // --- Top recommendations ---
  if (missingWhy.length > 0) {
    result.top_recommendations.push("Add WHY comments to " + missingWhy.length +
      " module(s) — documents the incident that motivated each gate");
  }
  if (missingWorkflow.length > 0) {
    result.top_recommendations.push("Add WORKFLOW tags to " + missingWorkflow.length +
      " module(s) — enables proper filtering when workflows are toggled");
  }
  if (slowMods.length > 0) {
    result.top_recommendations.push("Optimize " + slowMods[0].name + " (avg " +
      slowMods[0].avg + "ms) — biggest performance bottleneck");
  }
  if (neverTriggered.length > 5) {
    result.top_recommendations.push(neverTriggered.length +
      " PreToolUse gates never block — likely preventive deterrents, review if any are truly obsolete");
  }

  // Healthy system message
  if (result.top_recommendations.length === 0) {
    result.top_recommendations.push("System is healthy — all modules tagged, all events covered, no performance outliers");
  }

  return JSON.stringify(result);
}

/**
 * Build the structured prompt for LLM analysis.
 * Same data that analyzeHooks() uses, but formatted as markdown for claude -p.
 */
function buildAnalysisPrompt(eventModulesData, hookStats, perfData) {
  var summary = [];
  summary.push("# Hook System Analysis Input");
  summary.push("");

  if (perfData) {
    summary.push("## Performance");
    var perfKeys = Object.keys(perfData);
    for (var pi = 0; pi < perfKeys.length; pi++) {
      summary.push("- " + perfKeys[pi] + ": ~" + perfData[perfKeys[pi]] + "ms overhead");
    }
    summary.push("");
  }

  var events = Object.keys(eventModulesData);
  for (var ei = 0; ei < events.length; ei++) {
    var evt = events[ei];
    var mods = eventModulesData[evt];
    if (mods.length === 0) continue;
    summary.push("## " + evt + " (" + mods.length + " modules)");
    for (var mi = 0; mi < mods.length; mi++) {
      var m = mods[mi];
      var line = "- **" + m.name + "**";
      if (m.workflow) line += " [" + m.workflow + "]";
      if (m.description) line += " — " + m.description;
      if (m.stats) {
        var parts = [];
        if (m.stats.block > 0) parts.push(m.stats.block + " blocks");
        if (m.stats.error > 0) parts.push(m.stats.error + " errors");
        if (m.stats.msCount > 0) parts.push("avg " + Math.round(m.stats.msTotal / m.stats.msCount) + "ms, max " + m.stats.msMax + "ms");
        if (parts.length > 0) line += " (" + parts.join(", ") + ")";
      }
      summary.push(line);
      if (m.why) summary.push("  WHY: " + m.why);
    }
    summary.push("");
  }

  var totalBlocks = 0, totalErrors = 0, totalCalls = 0;
  var sKeys = Object.keys(hookStats);
  for (var si = 0; si < sKeys.length; si++) {
    totalBlocks += hookStats[sKeys[si]].block || 0;
    totalErrors += hookStats[sKeys[si]].error || 0;
    totalCalls += hookStats[sKeys[si]].total || 0;
  }
  summary.push("## Summary Stats");
  summary.push("- Total invocations: " + totalCalls);
  summary.push("- Total blocks: " + totalBlocks);
  summary.push("- Total errors: " + totalErrors);
  summary.push("");

  summary.push("Analyze this Claude Code hook system. Respond in this exact JSON format (no markdown fences):");
  summary.push('{"quality":{"score":"A/B/C/D","summary":"1 sentence"},');
  summary.push('"coverage_gaps":["gap1","gap2"],');
  summary.push('"dry_issues":["issue1","issue2"],');
  summary.push('"performance":["observation1","observation2"],');
  summary.push('"redundant_modules":["mod1 reason","mod2 reason"],');
  summary.push('"missing_modules":["suggested module and why"],');
  summary.push('"top_recommendations":["rec1","rec2","rec3"]}');
  summary.push("Be specific. Reference module names. Focus on actionable improvements.");

  return summary.join("\n");
}

/**
 * Run deep LLM analysis via claude -p.
 * Saves prompt to ~/.claude/reports/analysis-prompt.txt for manual re-run.
 * @returns {string} JSON string or "" on failure
 */
function deepAnalyze(eventModulesData, hookStats, perfData) {
  var cp = require("child_process");
  var prompt = buildAnalysisPrompt(eventModulesData, hookStats, perfData);

  var promptDir = path.join(HOME, ".claude", "reports");
  try { fs.mkdirSync(promptDir, { recursive: true }); } catch (e) {}
  var promptFile = path.join(promptDir, "analysis-prompt.txt");
  fs.writeFileSync(promptFile, prompt);
  process.stderr.write("[report] Analysis prompt saved: " + promptFile + "\n");

  try {
    var result = cp.execSync(
      "claude -p --dangerously-skip-permissions < " + JSON.stringify(promptFile).replace(/\\/g, "/"),
      { encoding: "utf-8", timeout: 300000, shell: true, maxBuffer: 2 * 1024 * 1024 }
    ).trim();
    var resultFile = path.join(promptDir, "analysis-result.json");
    fs.writeFileSync(resultFile, result);
    process.stderr.write("[report] Analysis result saved: " + resultFile + "\n");
    return result;
  } catch (e) {
    process.stderr.write("[report] LLM analysis failed: " + (e.message || e) + "\n");
    process.stderr.write("[report] Re-run: claude -p < " + promptFile.replace(/\\/g, "/") + "\n");
    process.stderr.write("[report] Then: node setup.js --analyze --input <result-file>\n");
    return "";
  }
}

/**
 * Merge LLM analysis into local analysis.
 * LLM provides deeper semantic analysis — prefer it for qualitative categories.
 */
function mergeAnalysis(localJson, llmJson) {
  var local, llm;
  try { local = JSON.parse(localJson); } catch (e) { return llmJson || localJson; }
  try {
    var cleaned = llmJson.replace(/^```json?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    llm = JSON.parse(cleaned);
  } catch (e) {
    process.stderr.write("[report] LLM JSON parse failed: " + (e.message || e) + "\n");
    return localJson;
  }

  // LLM provides deeper semantic analysis — prefer it for these categories
  if (llm.coverage_gaps && llm.coverage_gaps.length > 0) local.coverage_gaps = llm.coverage_gaps;
  if (llm.dry_issues && llm.dry_issues.length > 0) local.dry_issues = llm.dry_issues;
  if (llm.redundant_modules && llm.redundant_modules.length > 0) local.redundant_modules = llm.redundant_modules;
  if (llm.missing_modules && llm.missing_modules.length > 0) local.missing_modules = llm.missing_modules;
  // Merge performance — combine unique entries
  if (llm.performance && llm.performance.length > 0) {
    var perfSet = {};
    for (var i = 0; i < local.performance.length; i++) perfSet[local.performance[i]] = true;
    for (var j = 0; j < llm.performance.length; j++) {
      if (!perfSet[llm.performance[j]]) local.performance.push(llm.performance[j]);
    }
  }
  // Merge recommendations — LLM first, then unique local ones
  if (llm.top_recommendations && llm.top_recommendations.length > 0) {
    var recSet = {};
    var merged = [];
    for (var ri = 0; ri < llm.top_recommendations.length; ri++) {
      merged.push(llm.top_recommendations[ri]);
      recSet[llm.top_recommendations[ri]] = true;
    }
    for (var rj = 0; rj < local.top_recommendations.length; rj++) {
      if (!recSet[local.top_recommendations[rj]]) merged.push(local.top_recommendations[rj]);
    }
    local.top_recommendations = merged;
  }
  if (llm.quality) local.quality = llm.quality;

  return JSON.stringify(local);
}

/**
 * Render analysis section as HTML.
 * @param {string} analysisJson - JSON string from analyzeHooks()
 * @returns {string} HTML block
 */
function renderAnalysisHtml(analysisJson) {
  var a;
  try {
    // Strip markdown fences if present
    var cleaned = analysisJson.replace(/^```json?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    a = JSON.parse(cleaned);
  } catch (e) {
    return '<div class="analysis-section"><h2>Analysis</h2><p style="color:#f85149">Analysis failed to parse. Raw output:</p><pre style="white-space:pre-wrap;color:#8b949e;font-size:.8rem">' + escHtml(analysisJson.substring(0, 2000)) + '</pre></div>';
  }

  var h = [];
  h.push('<div class="analysis-section">');
  h.push('<h2 style="color:#c9d1d9;margin:1.5rem 0 1rem">System Analysis</h2>');

  // Quality score
  if (a.quality) {
    var scoreColor = a.quality.score === "A" ? "#3fb950" : a.quality.score === "B" ? "#58a6ff" : a.quality.score === "C" ? "#d29922" : "#f85149";
    h.push('<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem">');
    h.push('<div style="font-size:2.5rem;font-weight:bold;color:' + scoreColor + '">' + escHtml(a.quality.score || "?") + '</div>');
    h.push('<div style="color:#8b949e">' + escHtml(a.quality.summary || "") + '</div>');
    h.push('</div>');
  }

  // Grid of analysis categories
  h.push('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem">');

  var sections = [
    { key: "top_recommendations", title: "Top Recommendations", icon: "&#9733;", color: "#3fb950" },
    { key: "coverage_gaps", title: "Coverage Gaps", icon: "&#9888;", color: "#d29922" },
    { key: "dry_issues", title: "DRY Issues", icon: "&#128260;", color: "#58a6ff" },
    { key: "performance", title: "Performance", icon: "&#9889;", color: "#d29922" },
    { key: "redundant_modules", title: "Potentially Redundant", icon: "&#128465;", color: "#f85149" },
    { key: "missing_modules", title: "Suggested Modules", icon: "&#10133;", color: "#3fb950" }
  ];

  for (var si = 0; si < sections.length; si++) {
    var sec = sections[si];
    var items = a[sec.key];
    if (!items || !Array.isArray(items) || items.length === 0) continue;
    h.push('<div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem">');
    h.push('<div style="color:' + sec.color + ';font-weight:bold;margin-bottom:.5rem">' + sec.icon + ' ' + escHtml(sec.title) + '</div>');
    h.push('<ul style="margin:0;padding-left:1.2rem;color:#c9d1d9;font-size:.85rem">');
    for (var ii = 0; ii < items.length; ii++) {
      h.push('<li style="margin-bottom:.3rem">' + escHtml(items[ii]) + '</li>');
    }
    h.push('</ul></div>');
  }

  h.push('</div></div>');
  return h.join("\n");
}

/**
 * Classify a module's health verdict based on its stats.
 * @returns {string} "active"|"preventive"|"stale"|"dead"|"new"
 */
function classifyVerdict(stats, isSessionOrStop) {
  if (!stats || stats.total === 0) return "dead";
  // Modules with <50 calls haven't had enough exposure
  if (stats.total < 50) return "new";
  // Has blocked at least once
  if (stats.block > 0) {
    // Check if last block was >30 days ago
    if (stats.lastBlockTs) {
      var daysSinceBlock = (Date.now() - new Date(stats.lastBlockTs).getTime()) / 86400000;
      if (daysSinceBlock > 30) return "stale";
    }
    return "active";
  }
  // Many calls, zero blocks — preventive deterrent (or monitoring-only for PostToolUse/SessionStart/Stop)
  if (isSessionOrStop) return "active"; // SessionStart/Stop modules don't block
  return "preventive";
}

/**
 * Render the Module Review sortable table.
 * @param {object} eventModules - { eventName: [module objects] }
 * @param {object} hookStats - per-module stats from hook-log
 * @returns {string} HTML block
 */
function renderReviewTable(eventModules, hookStats) {
  var rows = [];
  var events = Object.keys(eventModules);
  for (var ei = 0; ei < events.length; ei++) {
    var evt = events[ei];
    var mods = eventModules[evt];
    for (var mi = 0; mi < mods.length; mi++) {
      var mod = mods[mi];
      if (mod.archived) continue;
      if (mod.name.charAt(0) === "_") continue; // skip helper files
      var statsKey = evt + "/" + mod.name.replace(/\.js$/, "");
      var s = hookStats[statsKey] || null;
      var isSessionOrStop = evt === "SessionStart" || evt === "Stop" || evt === "UserPromptSubmit";
      var verdict = classifyVerdict(s, isSessionOrStop);
      rows.push({
        name: mod.name.replace(/\.js$/, ""),
        event: evt,
        workflow: mod.workflow || "",
        why: mod.why || "",
        blocks: s ? s.block : 0,
        total: s ? s.total : 0,
        rate: s && s.total > 0 ? ((s.block / s.total) * 100).toFixed(1) : "0.0",
        avgMs: s && s.msCount > 0 ? Math.round(s.msTotal / s.msCount) : 0,
        lastBlock: s ? (s.lastBlockTs || "") : "",
        verdict: verdict
      });
    }
  }

  var h = [];
  h.push('<div class="review-section">');
  h.push('<h2>Module Review</h2>');
  h.push('<div class="review-subtitle">Click column headers to sort. Verdicts: ');
  h.push('<span class="verdict-active">active</span> blocks regularly, ');
  h.push('<span class="verdict-preventive">preventive</span> deters without blocking, ');
  h.push('<span class="verdict-stale">stale</span> no blocks in 30+ days, ');
  h.push('<span class="verdict-dead">dead</span> zero calls, ');
  h.push('<span class="verdict-new">new</span> &lt;50 calls');
  h.push('</div>');
  h.push('<table class="review-table" id="reviewTable">');
  h.push('<thead><tr>');
  var cols = [
    { key: "name", label: "Module" },
    { key: "event", label: "Event" },
    { key: "workflow", label: "Workflow" },
    { key: "why", label: "WHY" },
    { key: "blocks", label: "Blocks" },
    { key: "total", label: "Calls" },
    { key: "rate", label: "Block %" },
    { key: "avgMs", label: "Avg ms" },
    { key: "lastBlock", label: "Last Block" },
    { key: "verdict", label: "Verdict" }
  ];
  for (var ci = 0; ci < cols.length; ci++) {
    h.push('<th data-col="' + cols[ci].key + '" onclick="sortReviewTable(\'' + cols[ci].key + '\')">' + cols[ci].label + ' <span class="sort-arrow">&#9650;</span></th>');
  }
  h.push('</tr></thead><tbody>');

  for (var ri = 0; ri < rows.length; ri++) {
    var r = rows[ri];
    var lastBlockDisplay = r.lastBlock ? r.lastBlock.substring(0, 10) : "-";
    h.push('<tr data-name="' + escHtml(r.name) + '" data-event="' + escHtml(r.event) + '" data-workflow="' + escHtml(r.workflow) + '" data-why="' + escHtml(r.why) + '" data-blocks="' + r.blocks + '" data-total="' + r.total + '" data-rate="' + r.rate + '" data-avgms="' + r.avgMs + '" data-lastblock="' + escHtml(r.lastBlock) + '" data-verdict="' + r.verdict + '">');
    h.push('<td class="col-name" title="' + escHtml(r.name) + '">' + escHtml(r.name) + '</td>');
    h.push('<td><span class="' + (EVENT_BADGES[r.event] || "") + '" style="font-size:.7rem;padding:.1rem .4rem;border-radius:3px">' + escHtml(r.event) + '</span></td>');
    h.push('<td>' + (r.workflow ? '<span class="wf-badge wf-' + escHtml(r.workflow) + ' wf-default">' + escHtml(r.workflow) + '</span>' : '-') + '</td>');
    h.push('<td class="col-why" title="' + escHtml(r.why) + '">' + escHtml(r.why || "-") + '</td>');
    h.push('<td class="col-num">' + r.blocks + '</td>');
    h.push('<td class="col-num">' + r.total + '</td>');
    h.push('<td class="col-num">' + r.rate + '%</td>');
    h.push('<td class="col-num">' + r.avgMs + '</td>');
    h.push('<td class="col-num">' + lastBlockDisplay + '</td>');
    h.push('<td><span class="verdict-' + r.verdict + '">' + r.verdict + '</span></td>');
    h.push('</tr>');
  }

  h.push('</tbody></table></div>');
  return h.join("\n");
}

function generateReport(scan, outputPath, hookStats, options) {
  hookStats = hookStats || {};
  options = options || {};
  var now = new Date().toISOString().slice(0, 10);

  // Detect if already using hook-runner
  var usingRunner = false;
  var rawEventNames = Object.keys(scan.events);
  for (var i = 0; i < rawEventNames.length; i++) {
    var ents = scan.events[rawEventNames[i]].entries;
    for (var j = 0; j < ents.length; j++) {
      if (ents[j].isRunner) { usingRunner = true; break; }
    }
    if (usingRunner) break;
  }

  // Order events by user experience flow — include ALL canonical events even if empty
  var eventNames = [];
  for (var eo = 0; eo < EVENT_ORDER.length; eo++) {
    eventNames.push(EVENT_ORDER[eo]);
    if (!scan.events[EVENT_ORDER[eo]]) {
      scan.events[EVENT_ORDER[eo]] = { entries: [], matchers: [], moduleCount: 0 };
    }
  }
  for (var uk = 0; uk < rawEventNames.length; uk++) {
    if (eventNames.indexOf(rawEventNames[uk]) === -1) eventNames.push(rawEventNames[uk]);
  }

  // Collect all module info per event
  var eventModules = {};
  var totalModules = 0;
  for (var em = 0; em < eventNames.length; em++) {
    var evt = eventNames[em];
    var evtData = scan.events[evt];
    var modulesDir = null;
    for (var mh = 0; mh < evtData.entries.length; mh++) {
      if (evtData.entries[mh].isRunner && evtData.entries[mh].scriptPath) {
        modulesDir = path.join(path.dirname(evtData.entries[mh].scriptPath), "run-modules", evt);
        break;
      }
    }
    var mods = modulesDir ? collectModules(modulesDir) : [];
    eventModules[evt] = mods;
    var activeCount = mods.filter(function(m) { return !m.archived; }).length;
    totalModules += activeCount;
    evtData.moduleCount = activeCount;
  }

  // Compute log-level stats for summary
  var logTotalInvocations = 0, logTotalBlocks = 0, logTotalErrors = 0;
  var hookStatsKeys = Object.keys(hookStats);
  var mostBlockedMod = "", mostBlockedCount = 0;
  for (var hsk = 0; hsk < hookStatsKeys.length; hsk++) {
    var hs = hookStats[hookStatsKeys[hsk]];
    logTotalInvocations += hs.total;
    logTotalBlocks += hs.block;
    logTotalErrors += hs.error;
    if (hs.block > mostBlockedCount) { mostBlockedCount = hs.block; mostBlockedMod = hookStatsKeys[hsk]; }
  }
  var blockRate = logTotalInvocations > 0 ? ((logTotalBlocks / logTotalInvocations) * 100).toFixed(1) : "0";

  // Count missing scripts (broken references)
  var missingScripts = [];
  for (var ms = 0; ms < rawEventNames.length; ms++) {
    var msEntries = scan.events[rawEventNames[ms]].entries;
    for (var mse = 0; mse < msEntries.length; mse++) {
      if (msEntries[mse].scriptPath && !msEntries[mse].exists) {
        missingScripts.push({ event: rawEventNames[ms], path: msEntries[mse].scriptPath });
      }
    }
  }

  // Collect standalone hook info (for non-runner entries)
  var standaloneHooks = {};
  for (var sh = 0; sh < eventNames.length; sh++) {
    var shEvt = eventNames[sh];
    var shData = scan.events[shEvt];
    standaloneHooks[shEvt] = [];
    for (var she = 0; she < shData.entries.length; she++) {
      var shEntry = shData.entries[she];
      if (!shEntry.isRunner && shEntry.scriptPath) {
        standaloneHooks[shEvt].push({
          name: path.basename(shEntry.scriptPath),
          path: shEntry.scriptPath,
          command: shEntry.command,
          exists: shEntry.exists,
          matcher: shEntry.matcher,
          timeout: shEntry.timeout,
          description: shEntry.exists ? getModuleDescription(shEntry.scriptPath) : "",
          source: shEntry.exists ? getModuleSource(shEntry.scriptPath) : ""
        });
      }
    }
  }

  var h = [];
  h.push('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">');
  h.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  h.push('<title>Claude Code Hooks Report</title>');
  h.push('<style>');
  h.push('*{margin:0;padding:0;box-sizing:border-box}');
  h.push('body{background:#0d1117;color:#c9d1d9;font-family:"Segoe UI",-apple-system,sans-serif;line-height:1.6;padding:2rem;max-width:1400px;margin:0 auto}');
  h.push('h1{color:#58a6ff;font-size:1.8rem;margin-bottom:.3rem}');
  h.push('.subtitle{color:#8b949e;font-size:.95rem;margin-bottom:2rem}');
  h.push('.subtitle code{background:#161b22;padding:.1rem .4rem;border-radius:3px;color:#79c0ff;font-size:.85rem}');
  h.push('.stats{display:flex;gap:1.5rem;margin-bottom:2rem;flex-wrap:wrap}');
  h.push('.stat{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem 1.5rem;min-width:140px}');
  h.push('.stat-value{font-size:2rem;font-weight:700;color:#58a6ff}');
  h.push('.stat-label{font-size:.8rem;color:#8b949e;text-transform:uppercase;letter-spacing:.05em}');
  h.push('.stat-warn .stat-value{color:#d29922}');
  h.push('.stat-danger .stat-value{color:#f85149}');
  h.push('.arch-note{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;margin-bottom:2rem}');
  h.push('.arch-note h2{color:#d2a8ff;font-size:1rem;margin-bottom:.8rem}');
  h.push('.arch-note p{color:#8b949e;font-size:.9rem;margin-bottom:.5rem}');
  h.push('.arch-note code{background:#0d1117;padding:.1rem .4rem;border-radius:3px;color:#79c0ff;font-size:.85rem}');
  // Health warnings
  h.push('.warnings{background:#f8514915;border:1px solid #f8514944;border-radius:8px;padding:1rem 1.5rem;margin-bottom:2rem}');
  h.push('.warnings h3{color:#f85149;font-size:.9rem;margin-bottom:.5rem}');
  h.push('.warnings li{color:#c9d1d9;font-size:.85rem;margin-left:1.5rem;margin-bottom:.3rem}');
  h.push('.warnings code{background:#0d1117;padding:.1rem .3rem;border-radius:3px;color:#f85149;font-size:.8rem}');
  // Search + toolbar
  h.push('.toolbar{display:flex;gap:1rem;margin-bottom:1.5rem;align-items:center;flex-wrap:wrap}');
  h.push('.search-box{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:.5rem 1rem;color:#c9d1d9;font-size:.9rem;width:300px;outline:none}');
  h.push('.search-box:focus{border-color:#58a6ff}');
  h.push('.search-box::placeholder{color:#484f58}');
  h.push('.toolbar-btn{background:#21262d;border:1px solid #30363d;border-radius:6px;padding:.4rem .8rem;color:#8b949e;font-size:.8rem;cursor:pointer;transition:all .15s}');
  h.push('.toolbar-btn:hover{background:#30363d;color:#c9d1d9}');
  // Flow
  h.push('.flow{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;margin-bottom:2rem}');
  h.push('.flow h2{color:#58a6ff;font-size:1.1rem;margin-bottom:1rem}');
  h.push('.flow-diagram{display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding:1rem 0}');
  h.push('.flow-stage{display:flex;flex-direction:column;align-items:center;min-width:180px}');
  h.push('.flow-arrow{color:#484f58;font-size:1.5rem;padding-top:.8rem;min-width:40px;text-align:center}');
  h.push('.flow-event{background:#1f2937;border:2px solid #58a6ff;border-radius:8px;padding:.6rem 1rem;font-weight:600;color:#58a6ff;font-size:.9rem;margin-bottom:.5rem;white-space:nowrap}');
  h.push('.flow-modules{display:flex;flex-direction:column;gap:.3rem;align-items:center}');
  h.push('.flow-mod{background:#0d1117;border:1px solid #30363d;border-radius:4px;padding:.2rem .6rem;font-size:.7rem;color:#8b949e;white-space:nowrap}');
  h.push('.flow-mod-archived{opacity:.4;text-decoration:line-through}');
  h.push('.flow-mod-project{color:#d2a8ff}');
  h.push('.flow-mod-link{cursor:pointer;transition:border-color .15s,color .15s}');
  h.push('.flow-mod-link:hover{border-color:#58a6ff;color:#58a6ff}');
  h.push('.flow-mod-empty{color:#484f58;font-style:italic;border-style:dashed}');
  h.push('.flow-mod-missing{color:#f85149;border-color:#f8514944}');
  h.push('.flow-claude-event{font-size:.65rem;color:#484f58;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.25rem;white-space:nowrap}');
  h.push('.flow-subtitle{color:#8b949e;font-size:.8rem;margin-bottom:1rem}');
  h.push('.module-highlight{animation:highlight-fade 2s ease-out}');
  h.push('@keyframes highlight-fade{0%{background:#1f6feb33}100%{background:transparent}}');
  h.push('.event-section{margin-bottom:1.5rem}');
  h.push('.event-header{background:#161b22;border:1px solid #30363d;border-radius:8px 8px 0 0;padding:1rem 1.5rem;cursor:pointer;display:flex;align-items:center;gap:1rem;user-select:none}');
  h.push('.event-header:hover{background:#1c2128}');
  h.push('.event-header.collapsed{border-radius:8px}');
  h.push('.event-badge{font-size:.75rem;font-weight:600;padding:.2rem .6rem;border-radius:4px;text-transform:uppercase;letter-spacing:.05em}');
  h.push('.badge-session{background:#1f6feb33;color:#58a6ff;border:1px solid #1f6feb}');
  h.push('.badge-pre{background:#da363333;color:#f85149;border:1px solid #da3633}');
  h.push('.badge-post{background:#23863633;color:#3fb950;border:1px solid #238636}');
  h.push('.badge-stop{background:#9e6a0333;color:#d29922;border:1px solid #9e6a03}');
  h.push('.badge-prompt{background:#8b5cf633;color:#a78bfa;border:1px solid #7c3aed}');
  h.push('.event-title{font-size:1.1rem;font-weight:600;color:#c9d1d9}');
  h.push('.event-meta{margin-left:auto;color:#8b949e;font-size:.85rem}');
  h.push('.chevron{color:#484f58;transition:transform .2s;font-size:1.2rem}');
  h.push('.chevron.open{transform:rotate(90deg)}');
  h.push('.event-body{background:#0d1117;border:1px solid #30363d;border-top:none;border-radius:0 0 8px 8px;display:none}');
  h.push('.event-body.open{display:block}');
  h.push('.runner{padding:1rem 1.5rem;border-bottom:1px solid #21262d}');
  h.push('.runner-label{color:#8b949e;font-size:.8rem;text-transform:uppercase;margin-bottom:.3rem}');
  h.push('.runner-path{color:#79c0ff;font-family:"Cascadia Code","Fira Code",monospace;font-size:.85rem}');
  h.push('.matchers{padding:.5rem 1.5rem;display:flex;gap:.5rem;flex-wrap:wrap;border-bottom:1px solid #21262d}');
  h.push('.matcher{background:#1f2937;border:1px solid #30363d;border-radius:4px;padding:.15rem .5rem;font-size:.8rem;color:#d2a8ff;font-family:monospace}');
  h.push('.module{border-bottom:1px solid #21262d}');
  h.push('.module:last-child{border-bottom:none}');
  h.push('.module-header{padding:1rem 1.5rem;cursor:pointer;display:flex;align-items:center;gap:.8rem}');
  h.push('.module-header:hover{background:#161b22}');
  h.push('.module-icon{width:8px;height:8px;border-radius:50%;flex-shrink:0}');
  h.push('.icon-active{background:#3fb950;box-shadow:0 0 6px #3fb95066}');
  h.push('.icon-project{background:#d2a8ff;box-shadow:0 0 6px #d2a8ff66}');
  h.push('.icon-archived{background:#484f58}');
  h.push('.icon-missing{background:#f85149;box-shadow:0 0 6px #f8514966}');
  h.push('.icon-standalone{background:#58a6ff;box-shadow:0 0 6px #58a6ff66}');
  h.push('.module-name{font-weight:600;color:#c9d1d9;font-size:.95rem}');
  h.push('.module-desc{color:#8b949e;font-size:.85rem;margin-left:.5rem}');
  h.push('.module-scope{margin-left:auto;font-size:.7rem;padding:.15rem .4rem;border-radius:3px;font-weight:600;flex-shrink:0}');
  h.push('.scope-global{background:#23863622;color:#3fb950;border:1px solid #23863644}');
  h.push('.scope-project{background:#8b5cf622;color:#d2a8ff;border:1px solid #7c3aed44}');
  h.push('.scope-archived{background:#30363d;color:#484f58;border:1px solid #484f58}');
  h.push('.scope-standalone{background:#1f6feb22;color:#58a6ff;border:1px solid #1f6feb44}');
  h.push('.scope-missing{background:#f8514922;color:#f85149;border:1px solid #f8514944}');
  // Hook meta info (command, matcher, timeout)
  h.push('.hook-meta{padding:.5rem 1.5rem .5rem 3rem;display:flex;gap:1rem;flex-wrap:wrap;font-size:.8rem;color:#8b949e;border-bottom:1px solid #21262d}');
  h.push('.hook-meta code{background:#0d1117;padding:.1rem .3rem;border-radius:3px;color:#79c0ff;font-size:.75rem}');
  h.push('.hook-meta-label{color:#484f58;font-size:.7rem;text-transform:uppercase}');
  // Stats badges — right-aligned, tabular nums, only show blocks/errors (pass count is noise)
  h.push('.module-stats{display:flex;gap:.4rem;align-items:center;margin-left:auto;margin-right:.5rem;font-variant-numeric:tabular-nums}');
  h.push('.stat-block{font-size:.75rem;color:#f85149;background:#f8514922;padding:.15rem .5rem;border-radius:10px;font-weight:600;min-width:4rem;text-align:right}');
  h.push('.stat-error{font-size:.75rem;color:#d29922;background:#d2992222;padding:.15rem .5rem;border-radius:10px;font-weight:600;min-width:4rem;text-align:right}');
  h.push('.stat-timing{font-size:.75rem;color:#58a6ff;background:#1f6feb22;padding:.15rem .5rem;border-radius:10px;min-width:3rem;text-align:right}');
  // Timing chart
  h.push('.timing-section{margin-bottom:2rem;background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:1.5rem}');
  h.push('.timing-section h3{margin:0 0 1rem;color:#c9d1d9;font-size:1rem}');
  h.push('.timing-bar-row{display:flex;align-items:center;margin-bottom:.4rem;gap:.5rem}');
  h.push('.timing-label{font-size:.75rem;color:#8b949e;width:22ch;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0}');
  h.push('.timing-bar-container{flex:1;height:1.2rem;background:#161b22;border-radius:3px;position:relative;overflow:hidden}');
  h.push('.timing-bar-avg{height:100%;background:#1f6feb;border-radius:3px;min-width:2px}');
  h.push('.timing-bar-max{position:absolute;top:0;height:100%;background:#1f6feb44;border-radius:3px}');
  h.push('.timing-value{font-size:.75rem;color:#58a6ff;width:10ch;font-variant-numeric:tabular-nums}');
  // Sample triggers
  h.push('.samples-section{margin-bottom:1rem;border:1px solid #30363d;border-radius:6px;overflow:hidden}');
  h.push('.samples-title{font-size:.8rem;color:#8b949e;padding:.5rem .75rem;background:#161b22;border-bottom:1px solid #30363d;font-weight:600}');
  h.push('.sample{padding:.4rem .75rem;border-bottom:1px solid #21262d;display:flex;flex-wrap:wrap;gap:.4rem;align-items:baseline;font-size:.8rem}');
  h.push('.sample:last-child{border-bottom:none}');
  h.push('.sample-time{color:#484f58;font-size:.75rem;font-variant-numeric:tabular-nums}');
  h.push('.sample-result{padding:.05rem .35rem;border-radius:3px;font-size:.7rem;font-weight:600}');
  h.push('.sample-block,.sample-deny{color:#f85149;background:#f8514915}');
  h.push('.sample-error{color:#d29922;background:#d2992215}');
  h.push('.sample-tool{color:#79c0ff}');
  h.push('.sample-cmd{color:#8b949e;font-family:monospace;font-size:.75rem;max-width:40ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}');
  h.push('.sample-file{color:#d2a8ff}');
  h.push('.sample-project{color:#3fb950;font-size:.7rem;opacity:.7}');
  h.push('.sample-reason{color:#8b949e;font-size:.75rem;width:100%;margin-top:.2rem;padding-left:1rem;white-space:pre-wrap;max-height:3rem;overflow:hidden}');
  // Workflow badge on module cards
  h.push('.wf-badge{font-size:.7rem;padding:.1rem .5rem;border-radius:10px;font-weight:600;letter-spacing:.02em;white-space:nowrap}');
  h.push('.wf-shtd{background:#da363322;color:#f85149;border:1px solid #da363344}');
  h.push('.wf-code-quality{background:#23863622;color:#3fb950;border:1px solid #23863644}');
  h.push('.wf-messaging-safety{background:#9e6a0322;color:#d29922;border:1px solid #9e6a0344}');
  h.push('.wf-no-local-docker{background:#1f6feb22;color:#58a6ff;border:1px solid #1f6feb44}');
  h.push('.wf-default{background:#30363d;color:#8b949e;border:1px solid #484f58}');
  // WHY text
  h.push('.module-why{color:#8b949e;font-size:.8rem;padding:.25rem 1.5rem .25rem 3.3rem;font-style:italic;border-bottom:1px solid #21262d}');
  // Workflow summary section
  h.push('.wf-summary{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;margin-bottom:2rem}');
  h.push('.wf-summary h2{color:#d2a8ff;font-size:1.1rem;margin-bottom:1rem}');
  h.push('.wf-summary-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem}');
  h.push('.wf-card{background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:1rem;cursor:pointer;transition:border-color .15s}');
  h.push('.wf-card:hover{border-color:#58a6ff}');
  h.push('.wf-card-name{font-weight:600;color:#c9d1d9;font-size:.95rem;margin-bottom:.4rem;display:flex;align-items:center;gap:.5rem}');
  h.push('.wf-card-count{font-size:.75rem;color:#8b949e;background:#21262d;padding:.1rem .4rem;border-radius:3px}');
  h.push('.wf-card-modules{display:flex;flex-wrap:wrap;gap:.3rem}');
  h.push('.wf-card-mod{font-size:.7rem;color:#8b949e;background:#161b22;padding:.15rem .4rem;border-radius:3px;border:1px solid #21262d}');
  // Workflow filter buttons
  h.push('.wf-filters{display:flex;gap:.4rem;flex-wrap:wrap}');
  h.push('.wf-filter-btn{background:#21262d;border:1px solid #30363d;border-radius:10px;padding:.3rem .7rem;color:#8b949e;font-size:.75rem;cursor:pointer;transition:all .15s}');
  h.push('.wf-filter-btn:hover,.wf-filter-btn.active{background:#1f6feb33;color:#58a6ff;border-color:#1f6feb}');
  h.push('.module-chevron{color:#484f58;transition:transform .2s;flex-shrink:0}');
  h.push('.module-chevron.open{transform:rotate(90deg)}');
  h.push('.module-detail{display:none;padding:0 1.5rem 1rem 2.5rem}');
  h.push('.module-detail.open{display:block}');
  h.push('.code-block{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:1rem;overflow-x:auto;margin-top:.5rem;max-height:500px;overflow-y:auto}');
  h.push('.code-block pre{font-family:"Cascadia Code","Fira Code",monospace;font-size:.8rem;color:#c9d1d9;white-space:pre;tab-size:2}');
  h.push('.code-block .ln{color:#484f58;display:inline-block;width:2.5rem;text-align:right;margin-right:1rem;user-select:none}');
  h.push('.footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #21262d;color:#484f58;font-size:.8rem;text-align:center}');
  // Module Review table
  h.push('.review-section{background:#0d1117;border:1px solid #30363d;border-radius:8px;padding:1.5rem;margin-bottom:2rem}');
  h.push('.review-section h2{color:#c9d1d9;font-size:1.1rem;margin:0 0 .5rem}');
  h.push('.review-subtitle{color:#8b949e;font-size:.8rem;margin-bottom:1rem}');
  h.push('.review-table{width:100%;border-collapse:collapse;font-size:.8rem}');
  h.push('.review-table th{text-align:left;padding:.5rem .6rem;border-bottom:2px solid #30363d;color:#8b949e;cursor:pointer;user-select:none;white-space:nowrap;font-weight:600}');
  h.push('.review-table th:hover{color:#58a6ff}');
  h.push('.review-table th .sort-arrow{color:#484f58;margin-left:.2rem;font-size:.7rem}');
  h.push('.review-table th .sort-arrow.active{color:#58a6ff}');
  h.push('.review-table td{padding:.4rem .6rem;border-bottom:1px solid #21262d;color:#c9d1d9;vertical-align:top}');
  h.push('.review-table tr:hover{background:#161b22}');
  h.push('.review-table .col-name{font-weight:600;max-width:18ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}');
  h.push('.review-table .col-why{color:#8b949e;max-width:30ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}');
  h.push('.review-table .col-num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}');
  h.push('.verdict-active{color:#3fb950;background:#23863622;padding:.15rem .4rem;border-radius:3px;font-size:.7rem;font-weight:600}');
  h.push('.verdict-preventive{color:#d29922;background:#9e6a0322;padding:.15rem .4rem;border-radius:3px;font-size:.7rem;font-weight:600}');
  h.push('.verdict-stale{color:#8b949e;background:#30363d;padding:.15rem .4rem;border-radius:3px;font-size:.7rem;font-weight:600}');
  h.push('.verdict-dead{color:#f85149;background:#f8514922;padding:.15rem .4rem;border-radius:3px;font-size:.7rem;font-weight:600}');
  h.push('.verdict-new{color:#58a6ff;background:#1f6feb22;padding:.15rem .4rem;border-radius:3px;font-size:.7rem;font-weight:600}');
  h.push('</style></head><body>');

  h.push('<h1>Claude Code Hooks Report</h1>');
  h.push('<p class="subtitle">Your hooks at a glance &mdash; what runs, when it fires, and what it blocks. Source: <code>' + escHtml(SETTINGS_PATH.replace(HOME, "~")) + '</code> &mdash; Generated ' + now + '</p>');

  // Stats
  var totalScriptsOrModules = usingRunner ? totalModules : scan.scripts.length;
  var scriptsLabel = usingRunner ? "Active Modules" : "Hook Scripts";
  h.push('<div class="stats">');
  h.push('<div class="stat"><div class="stat-value">' + eventNames.length + '</div><div class="stat-label">Hook Events</div></div>');
  h.push('<div class="stat"><div class="stat-value">' + totalScriptsOrModules + '</div><div class="stat-label">' + scriptsLabel + '</div></div>');
  if (scan.totalMatchers > 0) h.push('<div class="stat"><div class="stat-value">' + scan.totalMatchers + '</div><div class="stat-label">Matchers</div></div>');
  if (logTotalBlocks > 0) h.push('<div class="stat stat-warn"><div class="stat-value">' + logTotalBlocks + '</div><div class="stat-label">Total Blocks</div></div>');
  if (logTotalErrors > 0) h.push('<div class="stat stat-danger"><div class="stat-value">' + logTotalErrors + '</div><div class="stat-label">Errors</div></div>');
  if (logTotalInvocations > 0) h.push('<div class="stat"><div class="stat-value">' + blockRate + '%</div><div class="stat-label">Block Rate</div></div>');
  if (missingScripts.length > 0) h.push('<div class="stat stat-danger"><div class="stat-value">' + missingScripts.length + '</div><div class="stat-label">Missing Files</div></div>');
  h.push('</div>');

  // Health warnings (missing scripts)
  if (missingScripts.length > 0) {
    h.push('<div class="warnings"><h3>Missing Hook Scripts</h3><ul>');
    for (var msi = 0; msi < missingScripts.length; msi++) {
      h.push('<li><code>' + escHtml(missingScripts[msi].path.replace(HOME, "~")) + '</code> (referenced in ' + escHtml(missingScripts[msi].event) + ')</li>');
    }
    h.push('</ul></div>');
  }

  // Architecture note
  if (usingRunner) {
    h.push('<div class="arch-note"><h2>Architecture: Runner + Module Pattern</h2>');
    h.push('<p>Each hook event has <strong>one runner script</strong> in <code>settings.json</code>. The runner auto-loads all <code>.js</code> modules from <code>run-modules/{Event}/</code>, sorted alphabetically.</p>');
    h.push('<p>To add behavior: create a new module file. Never add new hook entries to settings.json.</p>');
    h.push('<p>Modules can be <strong>sync or async</strong> (Promise). Async modules are awaited with a 4s per-module timeout. Stdin is always read synchronously.</p>');
    h.push('</div>');
  } else {
    h.push('<div class="arch-note"><h2>Current: Standalone Hook Scripts</h2>');
    h.push('<p>Each hook entry in <code>settings.json</code> points to an individual script. Adding new hooks requires editing settings.json.</p>');
    h.push('<p><strong>hook-runner</strong> replaces this with a modular system: one runner per event, modules in folders. <code>node setup.js</code> to migrate.</p>');
    h.push('</div>');
  }

  // Timing chart — horizontal bar chart of module latency
  var timedModules = [];
  var hsKeys = Object.keys(hookStats).sort();
  for (var ti = 0; ti < hsKeys.length; ti++) {
    var tms = hookStats[hsKeys[ti]];
    if (tms.msCount > 0) {
      timedModules.push({ key: hsKeys[ti], avg: Math.round(tms.msTotal / tms.msCount), max: tms.msMax, count: tms.msCount });
    }
  }
  if (timedModules.length > 0) {
    timedModules.sort(function(a, b) { return b.avg - a.avg; });
    var maxAvg = timedModules[0].avg || 1;
    var maxMax = 0;
    for (var tj = 0; tj < timedModules.length; tj++) {
      if (timedModules[tj].max > maxMax) maxMax = timedModules[tj].max;
    }
    var chartScale = maxMax || maxAvg || 1;

    h.push('<div class="timing-section">');
    h.push('<h3>Module Latency (avg / max ms)</h3>');
    for (var tk = 0; tk < timedModules.length && tk < 20; tk++) {
      var tm = timedModules[tk];
      var avgPct = Math.max(1, (tm.avg / chartScale) * 100);
      var maxPct = Math.max(1, (tm.max / chartScale) * 100);
      h.push('<div class="timing-bar-row">');
      h.push('<span class="timing-label" title="' + escHtml(tm.key) + '">' + escHtml(tm.key.split("/").pop()) + '</span>');
      h.push('<div class="timing-bar-container">');
      h.push('<div class="timing-bar-max" style="width:' + maxPct.toFixed(1) + '%"></div>');
      h.push('<div class="timing-bar-avg" style="width:' + avgPct.toFixed(1) + '%"></div>');
      h.push('</div>');
      h.push('<span class="timing-value">' + tm.avg + ' / ' + tm.max + 'ms</span>');
      h.push('</div>');
    }
    h.push('</div>');
  }

  // Build workflow summary: workflow name → { modules: [{event, name}], blocks, enabled }
  var workflowMap = {};
  for (var wi = 0; wi < eventNames.length; wi++) {
    var wEvt = eventNames[wi];
    var wMods = eventModules[wEvt] || [];
    for (var wm = 0; wm < wMods.length; wm++) {
      if (wMods[wm].archived) continue;
      var wfName = wMods[wm].workflow || "(untagged)";
      if (!workflowMap[wfName]) workflowMap[wfName] = { modules: [], blocks: 0 };
      var wModName = wMods[wm].name.replace(/\.js$/, "");
      workflowMap[wfName].modules.push({ event: wEvt, name: wModName });
      var wStatsKey = wEvt + "/" + wModName;
      if (hookStats[wStatsKey]) workflowMap[wfName].blocks += hookStats[wStatsKey].block;
    }
  }
  var workflowNames = Object.keys(workflowMap).sort(function(a, b) {
    if (a === "(untagged)") return 1;
    if (b === "(untagged)") return -1;
    return a < b ? -1 : 1;
  });

  // Workflow summary section
  if (workflowNames.length > 0) {
    h.push('<div class="wf-summary"><h2>Workflows (' + workflowNames.length + ')</h2>');
    h.push('<div class="wf-summary-grid">');
    for (var wsi = 0; wsi < workflowNames.length; wsi++) {
      var wn = workflowNames[wsi];
      var wd = workflowMap[wn];
      h.push('<div class="wf-card" onclick="filterByWorkflow(\'' + escHtml(wn) + '\')">');
      h.push('<div class="wf-card-name"><span class="wf-badge wf-' + escHtml(wn.replace(/[^a-z0-9-]/g, "-")) + '">' + escHtml(wn) + '</span>');
      h.push('<span class="wf-card-count">' + wd.modules.length + ' module' + (wd.modules.length !== 1 ? 's' : '') + '</span>');
      if (wd.blocks > 0) h.push('<span class="stat-block" style="font-size:.7rem;padding:.1rem .4rem">' + wd.blocks + ' blocked</span>');
      h.push('</div>');
      h.push('<div class="wf-card-modules">');
      for (var wmi = 0; wmi < wd.modules.length; wmi++) {
        var wmod = wd.modules[wmi];
        h.push('<span class="wf-card-mod" title="' + escHtml(wmod.event) + '">' + escHtml(wmod.name) + '</span>');
      }
      h.push('</div></div>');
    }
    h.push('</div></div>');
  }

  // Claude event labels that appear above hook event names
  var CLAUDE_EVENTS = {
    SessionStart: "Session begins",
    UserPromptSubmit: "User sends prompt",
    PreToolUse: "Tool about to run",
    PostToolUse: "Tool finished",
    Stop: "Session ending"
  };

  // Flow Diagram — works for both runner and standalone modes
  h.push('<div class="flow"><h2>Hook Event Flow</h2>');
  h.push('<div class="flow-subtitle">Click a hook to jump to its details below. ');
  h.push('<a href="https://docs.anthropic.com/en/docs/claude-code/hooks" target="_blank" style="color:#58a6ff;text-decoration:none">Claude Code Hooks docs &rarr;</a></div>');
  h.push('<div class="flow-diagram">');
  for (var fi = 0; fi < eventNames.length; fi++) {
    var fEvt = eventNames[fi];
    var fMods = eventModules[fEvt] || [];
    var fStandalone = standaloneHooks[fEvt] || [];
    if (fi > 0) h.push('<div class="flow-arrow">&rarr;</div>');
    h.push('<div class="flow-stage">');
    var claudeLabel = CLAUDE_EVENTS[fEvt] || "";
    if (claudeLabel) h.push('<div class="flow-claude-event">' + claudeLabel + '</div>');
    h.push('<div class="flow-event">' + fEvt + '</div><div class="flow-modules">');
    var hasItems = false;
    // Runner modules
    for (var fm = 0; fm < fMods.length; fm++) {
      var fmod = fMods[fm];
      var fclass = "flow-mod flow-mod-link";
      if (fmod.archived) fclass += " flow-mod-archived";
      else if (fmod.scope !== "global") fclass += " flow-mod-project";
      var modId = fEvt + "--" + fmod.name.replace(/\.js$/, "").replace(/[^a-zA-Z0-9-]/g, "-");
      h.push('<div class="' + fclass + '" onclick="scrollToModule(\'' + modId + '\')">' + escHtml(fmod.name.replace(/\.js$/, "")) + '</div>');
      hasItems = true;
    }
    // Standalone hooks
    for (var fs2 = 0; fs2 < fStandalone.length; fs2++) {
      var fsh = fStandalone[fs2];
      var shClass = "flow-mod flow-mod-link";
      if (!fsh.exists) shClass += " flow-mod-missing";
      var shId = fEvt + "--" + fsh.name.replace(/\.js$/, "").replace(/[^a-zA-Z0-9-]/g, "-");
      h.push('<div class="' + shClass + '" onclick="scrollToModule(\'' + shId + '\')">' + escHtml(fsh.name.replace(/\.js$/, "")) + '</div>');
      hasItems = true;
    }
    if (!hasItems) {
      h.push('<div class="flow-mod flow-mod-empty">(no hooks)</div>');
    }
    h.push('</div></div>');
  }
  h.push('</div></div>');

  // Module Review table
  h.push(renderReviewTable(eventModules, hookStats));

  // Toolbar: search + expand/collapse
  h.push('<div class="toolbar">');
  h.push('<input class="search-box" type="text" placeholder="Filter hooks by name..." oninput="filterHooks(this.value)">');
  h.push('<button class="toolbar-btn" onclick="expandAll()">Expand All</button>');
  h.push('<button class="toolbar-btn" onclick="collapseAll()">Collapse All</button>');
  if (workflowNames.length > 0) {
    h.push('<div class="wf-filters">');
    h.push('<button class="wf-filter-btn active" onclick="filterByWorkflow(\'all\')">All</button>');
    for (var wfi = 0; wfi < workflowNames.length; wfi++) {
      h.push('<button class="wf-filter-btn" onclick="filterByWorkflow(\'' + escHtml(workflowNames[wfi]) + '\')">' + escHtml(workflowNames[wfi]) + '</button>');
    }
    h.push('</div>');
  }
  h.push('</div>');

  // Helper to render a module/hook card with source code
  function renderHookCard(h2, evt3, item, hookStats2) {
    var isStandalone = !!item.command; // standalone hooks have a command property
    var isMissing = isStandalone && !item.exists;
    var iconClass2, scopeClass2, scopeLabel2;
    if (isMissing) {
      iconClass2 = "icon-missing"; scopeClass2 = "scope-missing"; scopeLabel2 = "MISSING";
    } else if (isStandalone) {
      iconClass2 = "icon-standalone"; scopeClass2 = "scope-standalone"; scopeLabel2 = "STANDALONE";
    } else if (item.archived) {
      iconClass2 = "icon-archived"; scopeClass2 = "scope-archived"; scopeLabel2 = "ARCHIVED";
    } else if (item.scope !== "global") {
      iconClass2 = "icon-project"; scopeClass2 = "scope-project"; scopeLabel2 = item.scope;
    } else {
      iconClass2 = "icon-active"; scopeClass2 = "scope-global"; scopeLabel2 = "GLOBAL";
    }
    var nameStyle2 = (item.archived || isMissing) ? ' style="color:#484f58;' + (item.archived ? 'text-decoration:line-through' : '') + '"' : '';
    var statsKey2 = evt3 + "/" + item.name.replace(/\.js$/, "");
    var modStats2 = hookStats2[statsKey2] || null;
    var modId2 = evt3 + "--" + item.name.replace(/\.js$/, "").replace(/[^a-zA-Z0-9-]/g, "-");

    var itemWorkflow = item.workflow || "";
    h2.push('<div class="module" id="' + modId2 + '" data-name="' + escHtml(item.name.toLowerCase()) + '" data-workflow="' + escHtml(itemWorkflow) + '">');
    h2.push('<div class="module-header" onclick="toggleModule(this)">');
    h2.push('<span class="module-chevron">&#9654;</span>');
    h2.push('<div class="module-icon ' + iconClass2 + '"></div>');
    h2.push('<span class="module-name"' + nameStyle2 + '>' + escHtml(item.name) + '</span>');
    if (item.description) h2.push('<span class="module-desc">&mdash; ' + escHtml(item.description) + '</span>');
    if (itemWorkflow) {
      var wfCssClass = "wf-badge wf-" + itemWorkflow.replace(/[^a-z0-9-]/g, "-");
      h2.push('<span class="' + wfCssClass + '">' + escHtml(itemWorkflow) + '</span>');
    }

    // Block/error/timing badges
    if (modStats2 && (modStats2.block > 0 || modStats2.error > 0 || modStats2.msCount > 0)) {
      h2.push('<span class="module-stats">');
      if (modStats2.msCount > 0) {
        var avgMs = Math.round(modStats2.msTotal / modStats2.msCount);
        h2.push('<span class="stat-timing" title="Avg latency (' + modStats2.msCount + ' samples, max ' + modStats2.msMax + 'ms)">' + avgMs + 'ms</span>');
      }
      if (modStats2.block > 0) h2.push('<span class="stat-block" title="Times this hook blocked a tool call">' + modStats2.block + ' blocked</span>');
      if (modStats2.error > 0) h2.push('<span class="stat-error" title="Times this hook errored">' + modStats2.error + ' errors</span>');
      h2.push('</span>');
    }

    h2.push('<span class="module-scope ' + scopeClass2 + '">' + scopeLabel2 + '</span>');
    h2.push('</div>');

    // WHY text — shown prominently between header and detail
    if (item.why) {
      h2.push('<div class="module-why">' + escHtml(item.why) + '</div>');
    }

    // Detail section
    h2.push('<div class="module-detail">');

    // For standalone hooks: show command, matcher, timeout, file path
    if (isStandalone) {
      h2.push('<div class="hook-meta">');
      h2.push('<span><span class="hook-meta-label">Command</span> <code>' + escHtml(item.command) + '</code></span>');
      if (item.matcher) h2.push('<span><span class="hook-meta-label">Matcher</span> <code>' + escHtml(item.matcher) + '</code></span>');
      h2.push('<span><span class="hook-meta-label">Timeout</span> <code>' + item.timeout + 's</code></span>');
      if (item.path) h2.push('<span><span class="hook-meta-label">File</span> <code>' + escHtml(item.path.replace(HOME, "~")) + '</code>' + (isMissing ? ' <span style="color:#f85149">FILE NOT FOUND</span>' : '') + '</span>');
      h2.push('</div>');
    }

    // Sample triggers
    if (modStats2 && modStats2.samples.length > 0) {
      h2.push('<div class="samples-section">');
      h2.push('<div class="samples-title">Recent blocks/errors (' + modStats2.samples.length + ')</div>');
      for (var si2 = 0; si2 < modStats2.samples.length; si2++) {
        var sample2 = modStats2.samples[si2];
        var sTime2 = "";
        try { sTime2 = sample2.ts.replace("T", " ").substring(0, 19); } catch(e3) {}
        h2.push('<div class="sample">');
        h2.push('<span class="sample-time">' + escHtml(sTime2) + '</span>');
        h2.push('<span class="sample-result sample-' + sample2.result + '">' + escHtml(sample2.result) + '</span>');
        if (sample2.tool) h2.push('<span class="sample-tool">' + escHtml(sample2.tool) + '</span>');
        if (sample2.cmd) h2.push('<span class="sample-cmd">' + escHtml(sample2.cmd) + '</span>');
        if (sample2.file) h2.push('<span class="sample-file">' + escHtml(sample2.file) + '</span>');
        if (sample2.project) h2.push('<span class="sample-project">' + escHtml(sample2.project) + '</span>');
        if (sample2.reason) h2.push('<div class="sample-reason">' + escHtml(sample2.reason) + '</div>');
        h2.push('</div>');
      }
      h2.push('</div>');
    }

    // Source code
    if (item.source) {
      var sLines = item.source.split("\n");
      var sCodeLines = [];
      for (var sli = 0; sli < sLines.length; sli++) {
        var slnStr = String(sli + 1);
        while (slnStr.length < 3) slnStr = " " + slnStr;
        sCodeLines.push('<span class="ln">' + slnStr + '</span>' + escHtml(sLines[sli]));
      }
      h2.push('<div class="code-block"><pre>' + sCodeLines.join("\n") + '</pre></div>');
    }
    h2.push('</div></div>');
  }

  // Event Sections
  for (var e = 0; e < eventNames.length; e++) {
    var evt2 = eventNames[e];
    var evtData2 = scan.events[evt2];
    var mods2 = eventModules[evt2] || [];
    var standalone2 = standaloneHooks[evt2] || [];
    var badge2 = EVENT_BADGES[evt2] || "badge-session";
    var title2 = EVENT_TITLES[evt2] || evt2;
    var metaParts = [];
    var activeModCount = mods2.filter(function(m) { return !m.archived; }).length;
    var totalItems = activeModCount + standalone2.length;
    if (totalItems > 0) metaParts.push(totalItems + " hook" + (totalItems !== 1 ? "s" : ""));
    else metaParts.push("no hooks");
    if (evtData2.matchers && evtData2.matchers.length > 0) metaParts.push(evtData2.matchers.join(", "));

    // Count blocks for this event
    var evtBlocks = 0;
    for (var ebi = 0; ebi < hookStatsKeys.length; ebi++) {
      if (hookStatsKeys[ebi].indexOf(evt2 + "/") === 0) evtBlocks += hookStats[hookStatsKeys[ebi]].block;
    }
    if (evtBlocks > 0) metaParts.push(evtBlocks + " block" + (evtBlocks !== 1 ? "s" : ""));

    h.push('<div class="event-section">');
    h.push('<div class="event-header collapsed" onclick="toggleEvent(this)">');
    h.push('<span class="chevron">&#9654;</span>');
    h.push('<span class="event-badge ' + badge2 + '">' + evt2 + '</span>');
    h.push('<span class="event-title">' + title2 + '</span>');
    h.push('<span class="event-meta">' + metaParts.join(' &bull; ') + '</span>');
    h.push('</div>');
    h.push('<div class="event-body">');

    // Runner info (if using hook-runner)
    var hasRunner = false;
    for (var hi = 0; hi < evtData2.entries.length; hi++) {
      if (evtData2.entries[hi].isRunner && evtData2.entries[hi].scriptPath) {
        h.push('<div class="runner"><div class="runner-label">Runner Script</div>');
        h.push('<div class="runner-path">' + escHtml(evtData2.entries[hi].scriptPath.replace(HOME, "~")) + '</div></div>');
        hasRunner = true;
        break;
      }
    }

    // Matchers
    if (evtData2.matchers.length > 0) {
      h.push('<div class="matchers">');
      for (var mi = 0; mi < evtData2.matchers.length; mi++) {
        h.push('<span class="matcher">' + escHtml(evtData2.matchers[mi]) + '</span>');
      }
      h.push('</div>');
    }

    // Empty state
    if (mods2.length === 0 && standalone2.length === 0 && !hasRunner) {
      h.push('<div class="runner"><div class="runner-label" style="color:#484f58">No hooks configured for this event</div>');
      h.push('<div class="runner-path" style="color:#484f58">Add a hook in <code>~/.claude/settings.json</code> under <code>hooks.' + evt2 + '</code></div></div>');
    }

    // Runner modules
    for (var mod_i = 0; mod_i < mods2.length; mod_i++) {
      renderHookCard(h, evt2, mods2[mod_i], hookStats);
    }

    // Standalone hooks
    for (var sh_i = 0; sh_i < standalone2.length; sh_i++) {
      renderHookCard(h, evt2, standalone2[sh_i], hookStats);
    }

    h.push('</div></div>');
  }

  // Analysis section (opt-in via options.analyze)
  if (options.analyze) {
    // Build analysis input from eventModules data
    var analysisData = {};
    for (var aei = 0; aei < eventNames.length; aei++) {
      var aEvt = eventNames[aei];
      var aMods = eventModules[aEvt] || [];
      var aModList = [];
      for (var ami = 0; ami < aMods.length; ami++) {
        if (aMods[ami].archived) continue;
        var aModName = aMods[ami].name.replace(/\.js$/, "");
        var aStatsKey = aEvt + "/" + aModName;
        aModList.push({
          name: aModName,
          workflow: aMods[ami].workflow || "",
          why: aMods[ami].why || "",
          description: aMods[ami].description || "",
          stats: hookStats[aStatsKey] || null
        });
      }
      if (aModList.length > 0) analysisData[aEvt] = aModList;
    }
    // Compute perf overview
    var perfOverview = {};
    for (var pei = 0; pei < eventNames.length; pei++) {
      var pEvt = eventNames[pei];
      var pMods = analysisData[pEvt] || [];
      var overhead = 0;
      for (var pmi = 0; pmi < pMods.length; pmi++) {
        if (pMods[pmi].stats && pMods[pmi].stats.msCount > 0) {
          overhead += Math.round(pMods[pmi].stats.msTotal / pMods[pmi].stats.msCount);
        }
      }
      if (overhead > 0) perfOverview[pEvt] = overhead;
    }

    // Local static analysis (always runs — fast)
    process.stderr.write("[report] Running local analysis...\n");
    var localResult = analyzeHooks(analysisData, hookStats, perfOverview);

    // Deep LLM analysis: --deep runs claude -p, --input loads pre-computed JSON
    var llmResult = "";
    if (options.inputFile) {
      try {
        llmResult = fs.readFileSync(options.inputFile, "utf-8").trim();
        process.stderr.write("[report] Loaded LLM analysis from " + options.inputFile + "\n");
      } catch (e) {
        process.stderr.write("[report] Failed to read " + options.inputFile + ": " + e.message + "\n");
      }
    } else if (options.deep) {
      process.stderr.write("[report] Running deep LLM analysis via claude -p (may take 2-5 min)...\n");
      llmResult = deepAnalyze(analysisData, hookStats, perfOverview);
    }

    // Merge if LLM result available
    var analysisResult = llmResult ? mergeAnalysis(localResult, llmResult) : localResult;
    if (analysisResult) {
      h.push(renderAnalysisHtml(analysisResult));
    }
  }

  h.push('<div class="footer">Generated by <a href="https://github.com/grobomo/hook-runner" style="color:#58a6ff;text-decoration:none">hook-runner</a> &mdash; ' + now + ' &mdash; <a href="https://docs.anthropic.com/en/docs/claude-code/hooks" style="color:#58a6ff;text-decoration:none">Claude Code Hooks docs</a></div>');
  h.push('<script>');
  h.push('function toggleEvent(el){var b=el.nextElementSibling;var c=el.querySelector(".chevron");b.classList.toggle("open");c.classList.toggle("open");el.classList.toggle("collapsed")}');
  h.push('function toggleModule(el){var p=el.parentElement;var d=p.querySelector(".module-detail");var c=el.querySelector(".module-chevron");if(d)d.classList.toggle("open");if(c)c.classList.toggle("open")}');
  h.push('function scrollToModule(id){var m=document.getElementById(id);if(!m)return;');
  h.push('var sec=m.closest(".event-section");if(sec){var hdr=sec.querySelector(".event-header");var body=sec.querySelector(".event-body");if(hdr&&body&&!body.classList.contains("open")){body.classList.add("open");hdr.querySelector(".chevron").classList.add("open");hdr.classList.remove("collapsed")}}');
  h.push('var det=m.querySelector(".module-detail");var chev=m.querySelector(".module-chevron");if(det&&!det.classList.contains("open")){det.classList.add("open");if(chev)chev.classList.add("open")}');
  h.push('m.scrollIntoView({behavior:"smooth",block:"center"});m.classList.add("module-highlight");setTimeout(function(){m.classList.remove("module-highlight")},2100)}');
  // Search filter
  h.push('function filterHooks(q){q=q.toLowerCase();document.querySelectorAll(".module").forEach(function(m){var n=m.getAttribute("data-name")||"";m.style.display=(!q||n.indexOf(q)!==-1)?"":"none"})}');
  // Workflow filter
  h.push('function filterByWorkflow(wf){');
  h.push('document.querySelectorAll(".wf-filter-btn").forEach(function(b){b.classList.remove("active");if(b.textContent===wf||(wf==="all"&&b.textContent==="All"))b.classList.add("active")});');
  h.push('document.querySelectorAll(".module").forEach(function(m){var mw=m.getAttribute("data-workflow")||"";if(wf==="all"){m.style.display=""}else if(wf==="(untagged)"){m.style.display=mw===""?"":"none"}else{m.style.display=mw===wf?"":"none"}});');
  h.push('expandAll()}');
  // Expand all / collapse all
  h.push('function expandAll(){document.querySelectorAll(".event-section").forEach(function(sec){var hdr=sec.querySelector(".event-header");var body=sec.querySelector(".event-body");if(body&&!body.classList.contains("open")){body.classList.add("open");hdr.querySelector(".chevron").classList.add("open");hdr.classList.remove("collapsed")}})}');
  h.push('function collapseAll(){document.querySelectorAll(".event-section").forEach(function(sec){var hdr=sec.querySelector(".event-header");var body=sec.querySelector(".event-body");if(body&&body.classList.contains("open")){body.classList.remove("open");hdr.querySelector(".chevron").classList.remove("open");hdr.classList.add("collapsed")}})}');
  // Module Review table sort
  h.push('var _reviewSortCol="verdict",_reviewSortAsc=true;');
  h.push('function sortReviewTable(col){');
  h.push('  var table=document.getElementById("reviewTable");if(!table)return;');
  h.push('  var tbody=table.querySelector("tbody");var rows=Array.from(tbody.querySelectorAll("tr"));');
  h.push('  if(_reviewSortCol===col){_reviewSortAsc=!_reviewSortAsc}else{_reviewSortCol=col;_reviewSortAsc=true}');
  h.push('  var numCols=["blocks","total","rate","avgms"];');
  h.push('  var verdictOrder={dead:0,stale:1,preventive:2,"new":3,active:4};');
  h.push('  rows.sort(function(a,b){');
  h.push('    var av=a.getAttribute("data-"+col)||"",bv=b.getAttribute("data-"+col)||"";');
  h.push('    var cmp=0;');
  h.push('    if(col==="verdict"){cmp=(verdictOrder[av]||0)-(verdictOrder[bv]||0)}');
  h.push('    else if(numCols.indexOf(col)!==-1){cmp=parseFloat(av)-parseFloat(bv)}');
  h.push('    else{cmp=av.localeCompare(bv)}');
  h.push('    return _reviewSortAsc?cmp:-cmp;');
  h.push('  });');
  h.push('  for(var i=0;i<rows.length;i++)tbody.appendChild(rows[i]);');
  h.push('  table.querySelectorAll("th .sort-arrow").forEach(function(a){a.classList.remove("active");a.innerHTML="&#9650;"});');
  h.push('  var th=table.querySelector("th[data-col=\\""+col+"\\"]");');
  h.push('  if(th){var arrow=th.querySelector(".sort-arrow");arrow.classList.add("active");arrow.innerHTML=_reviewSortAsc?"&#9650;":"&#9660;"}');
  h.push('}');
  h.push('</script>');
  h.push('</body></html>');

  var content = h.join("\n");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, "utf-8");
  return outputPath;
}

// Exports for use by setup.js
module.exports = {
  generateReport: generateReport,
  analyzeHooks: analyzeHooks,
  renderAnalysisHtml: renderAnalysisHtml,
  collectModules: collectModules,
  getModuleDescription: getModuleDescription,
  getModuleSource: getModuleSource,
  getModuleWorkflow: getModuleWorkflow,
  getModuleWhy: getModuleWhy,
  escHtml: escHtml,
  EVENT_ORDER: EVENT_ORDER,
  EVENT_TITLES: EVENT_TITLES,
  EVENT_BADGES: EVENT_BADGES
};
