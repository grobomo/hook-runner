// TOOLS: Write
// WORKFLOW: shtd, starter
// WHY: Claude rewrote a stop hook module, condensing a user-authored message
// that had been refined over 15 iterations. The message text was treated as
// "my code" instead of a carefully evolved artifact. This gate catches
// full-file rewrites (Write tool) on files with significant git history
// and suggests using Edit instead.
// T478: Added file-based cache — git rev-list was 882ms avg on Windows.
// Cache keyed by repo HEAD + file path, persists across hook invocations.
"use strict";
var cp = require("child_process");
var path = require("path");
var fs = require("fs");
var os = require("os");

// Commit count threshold — files with this many+ commits are "iterated"
var ITERATION_THRESHOLD = 5;

// T478: File-based cache to avoid repeated git rev-list calls (~800ms each on Windows).
// Cache file persists across hook invocations within the same session.
var CACHE_FILE = path.join(os.tmpdir(), "hook-runner-iterated-cache.json");
var CACHE_MAX_AGE = 3600000; // 1 hour

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

function getHeadSha(dir) {
  try {
    var dotGit = path.join(dir, ".git");
    var headPath;
    var stat = fs.statSync(dotGit);
    if (stat.isFile()) {
      var gitdir = fs.readFileSync(dotGit, "utf-8").trim().replace(/^gitdir:\s*/, "");
      if (!path.isAbsolute(gitdir)) gitdir = path.join(dir, gitdir);
      headPath = path.join(gitdir, "HEAD");
    } else {
      headPath = path.join(dotGit, "HEAD");
    }
    var head = fs.readFileSync(headPath, "utf-8").trim();
    if (head.indexOf("ref: ") === 0) {
      // Try loose ref first, then commondir (worktrees store refs in main repo)
      var gitBase = path.dirname(headPath);
      var refPath = path.join(gitBase, head.slice(5));
      try { return fs.readFileSync(refPath, "utf-8").trim().slice(0, 12); } catch (e) {}
      // Worktree: follow commondir to main repo's refs
      try {
        var commondir = fs.readFileSync(path.join(gitBase, "commondir"), "utf-8").trim();
        if (!path.isAbsolute(commondir)) commondir = path.join(gitBase, commondir);
        refPath = path.join(commondir, head.slice(5));
        return fs.readFileSync(refPath, "utf-8").trim().slice(0, 12);
      } catch (e) {}
      return "";
    }
    return head.slice(0, 12);
  } catch (e) { return ""; }
}

function findGitRoot(startDir) {
  var dir = startDir;
  for (var d = 0; d < 20; d++) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    var parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
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

  // T478: Check cache before spawning git
  var dir = path.dirname(filePath);
  var gitRoot = findGitRoot(dir);
  var headSha = gitRoot ? getHeadSha(gitRoot) : "";
  var cacheKey = headSha + ":" + norm;

  if (headSha) {
    var cache = loadCache();
    if (cache[cacheKey] !== undefined) {
      var commitCount = cache[cacheKey];
      if (commitCount < ITERATION_THRESHOLD) return null;
      return {
        decision: "block",
        reason: "CAUTION: Write (full rewrite) on a file with " + commitCount +
          " commits of history. This file has been iterated — a rewrite may " +
          "discard carefully refined content. Use Edit for surgical changes instead. " +
          "If a full rewrite is truly needed, the user must explicitly approve it. " +
          "File: " + path.basename(filePath)
      };
    }
  }

  // Cache miss — run git rev-list
  try {
    var countStr = cp.execFileSync("git", ["rev-list", "--count", "HEAD", "--", path.basename(filePath)],
      { cwd: dir, encoding: "utf-8", timeout: 1500, stdio: ["pipe", "pipe", "pipe"], windowsHide: true }
    ).trim();

    var commitCount = parseInt(countStr, 10) || 0;

    // Save to cache
    if (headSha) {
      var cache = loadCache();
      cache[cacheKey] = commitCount;
      saveCache(cache);
    }

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
