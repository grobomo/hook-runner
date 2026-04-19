// TOOLS: Write
// WORKFLOW: shtd, starter
// WHY: Claude rewrote a stop hook module, condensing a user-authored message
// that had been refined over 15 iterations. The message text was treated as
// "my code" instead of a carefully evolved artifact. This gate catches
// full-file rewrites (Write tool) on files with significant git history
// and suggests using Edit instead.
// T478: Added file-based cache — git rev-list was 882ms avg on Windows.
// T496: Switched cache key from headSha:path to path-only with 5min TTL.
// headSha-based keys invalidated on every commit, causing constant cache misses
// (663ms avg, 1556ms spikes). Commit counts change rarely — TTL is sufficient.
"use strict";
var cp = require("child_process");
var path = require("path");
var fs = require("fs");
var os = require("os");

// Commit count threshold — files with this many+ commits are "iterated"
var ITERATION_THRESHOLD = 5;

// T496: File-based cache keyed by normalized file path with per-entry TTL.
// Avoids git rev-list spawns (~800ms each on Windows). Persists across invocations.
var CACHE_FILE = path.join(os.tmpdir(), "hook-runner-iterated-cache.json");
var CACHE_MAX_AGE = 3600000; // 1 hour — evict entire cache file
var ENTRY_TTL = 300000;      // 5 minutes — per-entry staleness

function loadCache() {
  try {
    var stat = fs.statSync(CACHE_FILE);
    if (Date.now() - stat.mtimeMs > CACHE_MAX_AGE) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch (e) { return {}; }
}

function saveCache(cache) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch (e) { /* best effort */ }
}

module.exports = function(input) {
  if (input.tool_name !== "Write") return null;

  var filePath = (input.tool_input || {}).file_path || "";
  if (!filePath) return null;

  // Only check files in tracked directories (hooks, rules, skills, scripts)
  var norm = filePath.replace(/\\/g, "/");
  var watchedDirs = ["/hooks/", "/rules/", "/skills/", "/scripts/"];
  var isWatched = false;
  for (var i = 0; i < watchedDirs.length; i++) {
    if (norm.indexOf(watchedDirs[i]) !== -1) { isWatched = true; break; }
  }
  if (!isWatched) return null;

  // T496: Check cache by normalized path with TTL (no headSha dependency)
  var dir = path.dirname(filePath);
  var now = Date.now();
  var cache = loadCache();
  var cached = cache[norm];

  if (cached && (now - cached.ts) < ENTRY_TTL) {
    // Cache hit — use stored count (no git spawn needed)
    if (cached.count < ITERATION_THRESHOLD) return null;
    return {
      decision: "block",
      reason: "CAUTION: Write (full rewrite) on a file with " + cached.count +
        " commits of history. This file has been iterated — a rewrite may " +
        "discard carefully refined content. Use Edit for surgical changes instead. " +
        "If a full rewrite is truly needed, the user must explicitly approve it. " +
        "File: " + path.basename(filePath)
    };
  }

  // Cache miss or stale — run git rev-list
  try {
    var countStr = cp.execFileSync("git", ["rev-list", "--count", "HEAD", "--", path.basename(filePath)],
      { cwd: dir, encoding: "utf-8", timeout: 1500, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
    ).trim();

    var commitCount = parseInt(countStr, 10) || 0;

    // Save to cache with timestamp
    cache[norm] = { count: commitCount, ts: now };
    saveCache(cache);

    if (commitCount >= ITERATION_THRESHOLD) {
      return {
        decision: "block",
        reason: "CAUTION: Write (full rewrite) on a file with " + commitCount +
          " commits of history. This file has been iterated — a rewrite may " +
          "discard carefully refined content. Use Edit for surgical changes instead. " +
          "If a full rewrite is truly needed, the user must explicitly approve it. " +
          "File: " + path.basename(filePath)
      };
    }
  } catch (e) {
    // Not in a git repo or git error — allow
  }

  return null;
};
