// WORKFLOW: shtd
// WHY: A background process silently overwrote live hook modules between prompts,
// stripping WORKFLOW tags from 37 modules. Mid-session drift went undetected.
"use strict";
// UserPromptSubmit (async): monitors live hooks vs repo.
// First invocation (or >1hr since last full scan): full scan + auto-repair + workflow compliance.
// Subsequent invocations: spot-check 5 random modules every 60s.
// Subsumes SessionStart/hook-integrity-check — one module handles both start and mid-session.
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var RATE_LIMIT_MS = 60000; // 60 seconds between spot-checks
var FULL_SCAN_INTERVAL_MS = 3600000; // 1 hour between full scans
var SAMPLE_SIZE = 5; // random modules to spot-check per prompt

function md5(filePath) {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
  } catch (e) { return null; }
}

function getTimestamp(stampPath) {
  try {
    return parseInt(fs.readFileSync(stampPath, "utf-8").trim(), 10) || 0;
  } catch (e) { return 0; }
}
function setTimestamp(stampPath) {
  try { fs.writeFileSync(stampPath, String(Date.now())); } catch (e) { /* best effort */ }
}

function buildPairList(repoModDir, liveModDir) {
  var events = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];
  var allPairs = [];
  for (var ei = 0; ei < events.length; ei++) {
    var repoEventDir = path.join(repoModDir, events[ei]);
    if (!fs.existsSync(repoEventDir)) continue;
    var liveEventDir = path.join(liveModDir, events[ei]);
    var entries;
    try { entries = fs.readdirSync(repoEventDir, { withFileTypes: true }); } catch (e) { continue; }
    for (var fi = 0; fi < entries.length; fi++) {
      if (entries[fi].isFile() && entries[fi].name.indexOf(".js") === entries[fi].name.length - 3) {
        allPairs.push({ repo: path.join(repoEventDir, entries[fi].name), live: path.join(liveEventDir, entries[fi].name), label: events[ei] + "/" + entries[fi].name });
      } else if (entries[fi].isDirectory() && entries[fi].name !== "archive" && entries[fi].name.charAt(0) !== "_") {
        var subRepoDir = path.join(repoEventDir, entries[fi].name);
        var subLiveDir = path.join(liveEventDir, entries[fi].name);
        var subFiles;
        try { subFiles = fs.readdirSync(subRepoDir); } catch (e) { continue; }
        for (var sfi = 0; sfi < subFiles.length; sfi++) {
          if (subFiles[sfi].indexOf(".js") !== subFiles[sfi].length - 3) continue;
          allPairs.push({ repo: path.join(subRepoDir, subFiles[sfi]), live: path.join(subLiveDir, subFiles[sfi]), label: events[ei] + "/" + entries[fi].name + "/" + subFiles[sfi] });
        }
      }
    }
  }
  return allPairs;
}

function scanAndRepair(allPairs) {
  var drifted = [];
  var repaired = [];
  for (var ai = 0; ai < allPairs.length; ai++) {
    var rh = md5(allPairs[ai].repo);
    var lh = md5(allPairs[ai].live);
    if (rh && (!lh || rh !== lh)) {
      var suffix = lh ? " (drift->repaired)" : " (missing->copied)";
      try {
        var liveDir = path.dirname(allPairs[ai].live);
        if (!fs.existsSync(liveDir)) fs.mkdirSync(liveDir, { recursive: true });
        fs.copyFileSync(allPairs[ai].repo, allPairs[ai].live);
        drifted.push(allPairs[ai].label + suffix);
        repaired.push(allPairs[ai].label);
      } catch (e) {
        drifted.push(allPairs[ai].label + " (REPAIR FAILED)");
      }
    }
  }
  return { drifted: drifted, repaired: repaired };
}

function detectOrphans(repoModDir, liveModDir) {
  var events = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];
  var orphans = [];
  for (var ei = 0; ei < events.length; ei++) {
    var repoEventDir = path.join(repoModDir, events[ei]);
    var liveEventDir = path.join(liveModDir, events[ei]);
    if (!fs.existsSync(liveEventDir)) continue;
    var liveFiles;
    try { liveFiles = fs.readdirSync(liveEventDir); } catch (e) { continue; }
    for (var li = 0; li < liveFiles.length; li++) {
      if (liveFiles[li].indexOf(".js") !== liveFiles[li].length - 3) continue;
      try { if (fs.statSync(path.join(liveEventDir, liveFiles[li])).isDirectory()) continue; } catch (e) { continue; }
      if (!fs.existsSync(path.join(repoEventDir, liveFiles[li]))) {
        orphans.push(events[ei] + "/" + liveFiles[li]);
      }
    }
  }
  return orphans;
}

function checkRunnerFiles(repoDir, hooksDir) {
  var drifted = [];
  var repaired = [];
  var count = 0;
  var RUNNER_FILES;
  try { RUNNER_FILES = require(path.join(repoDir, "constants.js")).RUNNER_FILES; } catch (e) { return { drifted: [], repaired: [], count: 0 }; }
  for (var ri = 0; ri < RUNNER_FILES.length; ri++) {
    count++;
    var rrh = md5(path.join(repoDir, RUNNER_FILES[ri]));
    var rlh = md5(path.join(hooksDir, RUNNER_FILES[ri]));
    if (rrh && rlh && rrh !== rlh) {
      try {
        fs.copyFileSync(path.join(repoDir, RUNNER_FILES[ri]), path.join(hooksDir, RUNNER_FILES[ri]));
        drifted.push("runner:" + RUNNER_FILES[ri] + " (drift->repaired)");
        repaired.push("runner:" + RUNNER_FILES[ri]);
      } catch (e) {
        drifted.push("runner:" + RUNNER_FILES[ri] + " (REPAIR FAILED)");
      }
    }
  }
  return { drifted: drifted, repaired: repaired, count: count };
}

function checkWorkflowCompliance(hooksDir, projectDir) {
  var violations = [];
  try {
    var wf = require(path.join(hooksDir, "workflow.js"));
    var globalConfig = wf.readConfig(hooksDir);
    var enforced = Object.keys(globalConfig).filter(function(k) { return globalConfig[k] === true; });
    var projectConfigPath = path.join(projectDir, "workflow-config.json");
    var projectConfig = {};
    if (fs.existsSync(projectConfigPath)) {
      try { projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8")); } catch (e) {}
    }
    for (var wi = 0; wi < enforced.length; wi++) {
      if (projectConfig[enforced[wi]] === false) {
        violations.push(enforced[wi]);
      }
    }
  } catch (e) { /* workflow.js not available */ }
  return violations;
}

module.exports = async function(input) {
  var home = process.env.HOME || process.env.USERPROFILE;
  var hooksDir = path.join(home, ".claude", "hooks");
  var liveModDir = path.join(hooksDir, "run-modules");
  var markerPath = path.join(hooksDir, ".hook-runner-repo");
  var spotStampPath = path.join(hooksDir, ".integrity-last-check");
  var fullStampPath = path.join(hooksDir, ".integrity-last-full-scan");
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var now = Date.now();

  // Rate limit spot-checks
  var lastSpot = getTimestamp(spotStampPath);
  var lastFull = getTimestamp(fullStampPath);
  var needsFullScan = (now - lastFull >= FULL_SCAN_INTERVAL_MS);
  var needsSpotCheck = (now - lastSpot >= RATE_LIMIT_MS);

  if (!needsFullScan && !needsSpotCheck) return null;

  var repoDir = null;
  if (fs.existsSync(markerPath)) {
    try { repoDir = fs.readFileSync(markerPath, "utf-8").trim(); } catch (e) { /* skip */ }
  }
  if (!repoDir || !fs.existsSync(path.join(repoDir, "modules"))) return null;

  var repoModDir = path.join(repoDir, "modules");
  var allPairs = buildPairList(repoModDir, liveModDir);
  if (allPairs.length === 0) return null;

  setTimestamp(spotStampPath);

  if (needsFullScan) {
    // === Full scan: modules + runners + orphans + workflow compliance ===
    setTimestamp(fullStampPath);
    var messages = [];

    var modResult = scanAndRepair(allPairs);
    var runnerResult = checkRunnerFiles(repoDir, hooksDir);
    var totalChecked = allPairs.length + runnerResult.count;
    var allDrifted = modResult.drifted.concat(runnerResult.drifted);
    var allRepaired = modResult.repaired.concat(runnerResult.repaired);
    var orphans = detectOrphans(repoModDir, liveModDir);

    if (allDrifted.length > 0) {
      messages.push("Hook integrity: " + allRepaired.length + "/" + allDrifted.length + " drifted files repaired (" + totalChecked + " checked)");
      for (var di = 0; di < allDrifted.length; di++) {
        messages.push("  - " + allDrifted[di]);
      }
    } else {
      messages.push("Hook integrity: " + totalChecked + " files verified, all match repo");
    }
    if (orphans.length > 0) {
      messages.push("Hook integrity: " + orphans.length + " orphan(s) in live: " + orphans.join(", "));
    }

    // Workflow compliance
    if (projectDir) {
      var violations = checkWorkflowCompliance(hooksDir, projectDir);
      if (violations.length > 0) {
        messages.push("Workflow compliance: VIOLATION — " + violations.join(", ") + " disabled at project level (globally enforced)");
      }
    }

    // Log
    try {
      var hookLog = require(path.join(hooksDir, "hook-log.js"));
      hookLog.logHook("UserPromptSubmit", "hook-integrity-monitor", "integrity", {
        trigger: "full-scan",
        project: projectDir,
        totalChecked: totalChecked,
        drifted: allDrifted,
        repaired: allRepaired,
        orphans: orphans
      });
    } catch (e) { /* best effort */ }

    if (messages.length === 0) return null;
    return { text: messages.join("\n") };
  }

  // === Spot-check: random sample using mtime+size comparison (fast) ===
  // Avoids MD5 computation for spot-checks — stat() is ~10x faster than read+hash.
  // If size differs or repo is newer, triggers full MD5 scan to confirm and repair.
  var sampleSize = Math.min(SAMPLE_SIZE, allPairs.length);
  var sampled = [];
  var indices = {};
  while (sampled.length < sampleSize) {
    var idx = Math.floor(Math.random() * allPairs.length);
    if (!indices[idx]) {
      indices[idx] = true;
      sampled.push(allPairs[idx]);
    }
  }

  var driftFound = false;
  for (var si = 0; si < sampled.length; si++) {
    try {
      var rStat = fs.statSync(sampled[si].repo);
      var lStat = fs.statSync(sampled[si].live);
      if (rStat.size !== lStat.size) { driftFound = true; break; }
      if (rStat.mtimeMs > lStat.mtimeMs + 1000) { driftFound = true; break; }
    } catch (e) {
      driftFound = true; break;
    }
  }

  if (!driftFound) return null;

  // Drift detected — full scan + repair
  var result = scanAndRepair(allPairs);
  if (result.drifted.length > 0) {
    try {
      var hookLog2 = require(path.join(hooksDir, "hook-log.js"));
      hookLog2.logHook("UserPromptSubmit", "hook-integrity-monitor", "integrity", {
        trigger: "mid-session-drift",
        drifted: result.drifted,
        repaired: result.repaired
      });
    } catch (e) { /* best effort */ }
  }

  return null; // Never block user prompts
};
