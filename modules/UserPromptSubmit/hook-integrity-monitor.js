// WORKFLOW: shtd
// WHY: A background process silently overwrote live hook modules between prompts,
// stripping WORKFLOW tags from 37 modules. Mid-session drift went undetected.
"use strict";
// UserPromptSubmit (async): spot-check live hooks vs repo on each prompt
// Rate-limited: skips if last check was <60s ago.
// On drift: full scan + auto-repair (delegates to hook-integrity-check logic).
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var RATE_LIMIT_MS = 60000; // 60 seconds
var SAMPLE_SIZE = 5; // random modules to spot-check per prompt
var _lastCheckTime = 0;

function md5(filePath) {
  try {
    return crypto.createHash("md5").update(fs.readFileSync(filePath)).digest("hex");
  } catch (e) { return null; }
}

module.exports = async function(input) {
  var now = Date.now();
  if (now - _lastCheckTime < RATE_LIMIT_MS) return null;
  _lastCheckTime = now;

  var home = process.env.HOME || process.env.USERPROFILE;
  var hooksDir = path.join(home, ".claude", "hooks");
  var liveModDir = path.join(hooksDir, "run-modules");
  var markerPath = path.join(hooksDir, ".hook-runner-repo");

  var repoDir = null;
  if (fs.existsSync(markerPath)) {
    try { repoDir = fs.readFileSync(markerPath, "utf-8").trim(); } catch (e) { /* skip */ }
  }
  if (!repoDir || !fs.existsSync(path.join(repoDir, "modules"))) return null;

  var repoModDir = path.join(repoDir, "modules");
  var events = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];

  // Build list of all repo module paths
  var allPairs = []; // [{repo, live}]
  for (var ei = 0; ei < events.length; ei++) {
    var repoEventDir = path.join(repoModDir, events[ei]);
    if (!fs.existsSync(repoEventDir)) continue;
    var liveEventDir = path.join(liveModDir, events[ei]);
    var entries;
    try { entries = fs.readdirSync(repoEventDir, { withFileTypes: true }); } catch (e) { continue; }
    for (var fi = 0; fi < entries.length; fi++) {
      if (entries[fi].isFile() && entries[fi].name.indexOf(".js") === entries[fi].name.length - 3) {
        allPairs.push({ repo: path.join(repoEventDir, entries[fi].name), live: path.join(liveEventDir, entries[fi].name), label: events[ei] + "/" + entries[fi].name });
      }
    }
  }

  if (allPairs.length === 0) return null;

  // Random sample
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

  // Spot-check sampled modules
  var driftFound = false;
  for (var si = 0; si < sampled.length; si++) {
    var rh = md5(sampled[si].repo);
    var lh = md5(sampled[si].live);
    if (rh && rh !== lh) {
      driftFound = true;
      break;
    }
  }

  if (!driftFound) return null;

  // Drift detected — full scan + repair
  var drifted = [];
  var repaired = [];
  for (var ai = 0; ai < allPairs.length; ai++) {
    var arh = md5(allPairs[ai].repo);
    var alh = md5(allPairs[ai].live);
    if (arh && arh !== alh) {
      try {
        var liveDir = path.dirname(allPairs[ai].live);
        if (!fs.existsSync(liveDir)) fs.mkdirSync(liveDir, { recursive: true });
        fs.copyFileSync(allPairs[ai].repo, allPairs[ai].live);
        drifted.push(allPairs[ai].label);
        repaired.push(allPairs[ai].label);
      } catch (e) {
        drifted.push(allPairs[ai].label + " (repair failed)");
      }
    }
  }

  // Log to hook-log
  if (drifted.length > 0) {
    try {
      var hookLog = require(path.join(hooksDir, "hook-log.js"));
      hookLog.logHook("UserPromptSubmit", "hook-integrity-monitor", "integrity", {
        trigger: "mid-session-drift",
        drifted: drifted,
        repaired: repaired
      });
    } catch (e) { /* best effort */ }
  }

  return null; // Never block user prompts
};
