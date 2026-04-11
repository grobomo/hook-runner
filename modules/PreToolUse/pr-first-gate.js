// WORKFLOW: shtd
// WHY: Claude created specs and wrote code on branches without opening a PR first.
// The dev team monitors progress via GitHub Mobile notifications — without a PR,
// nobody knows work is happening. The correct flow is:
// 1) receive task  2) create PR  3) spec  4) failing tests  5) implement  6) e2e  7) merge
// This gate blocks spec/code edits on feature branches that don't have an open PR.
"use strict";
var cp = require("child_process");
var fs = require("fs");
var path = require("path");

// File-based cache with TTL — gh pr list is ~67ms per call, runs on every
// Edit/Write on feature branches. Once a PR exists it won't disappear,
// so cache the result for 5 minutes to avoid repeated network calls.
var CACHE_TTL_MS = 300000; // 5 minutes
var CACHE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", ".pr-cache");

function readCache(branch) {
  try {
    var fp = path.join(CACHE_DIR, encodeURIComponent(branch) + ".json");
    var data = JSON.parse(fs.readFileSync(fp, "utf-8"));
    if (Date.now() - (data.ts || 0) < CACHE_TTL_MS) return data.hasPR;
  } catch (e) { /* miss */ }
  return undefined;
}

function writeCache(branch, hasPR) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    var fp = path.join(CACHE_DIR, encodeURIComponent(branch) + ".json");
    fs.writeFileSync(fp, JSON.stringify({ ts: Date.now(), hasPR: hasPR }));
  } catch (e) { /* best effort */ }
}

module.exports = function(input) {
  var tool = (input.tool_name || "").toLowerCase();

  // Only gate code-editing tools
  if (tool !== "edit" && tool !== "write" && tool !== "bash") return null;

  // For Bash, only gate mkdir (spec directories) — not general commands
  if (tool === "bash") {
    var cmd = (input.tool_input || {}).command || "";
    if (!/\bmkdir\b/.test(cmd)) return null;
    // Allow mkdir for non-spec directories
    if (!/specs\//.test(cmd)) return null;
  }

  // Get file path for Edit/Write
  var filePath = "";
  try {
    var ti = typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : (input.tool_input || {});
    filePath = ti.file_path || "";
  } catch(e) {}

  // Allow: TODO.md, tasks.md, CHANGELOG.md — needed before PR exists
  var basename = filePath.replace(/.*[\/\\]/, "").toLowerCase();
  if (basename === "todo.md" || basename === "tasks.md" || basename === "changelog.md") return null;

  // Allow: non-code files that are part of task setup
  if (/\.github[\/\\]/.test(filePath)) return null;

  // Only enforce on feature branches
  var branch = (input._git && input._git.branch) || "";
  if (!branch || branch === "main" || branch === "master") return null;

  // Check if an open PR exists for this branch (file-based cache, 5min TTL)
  var cached = readCache(branch);
  if (cached !== undefined) {
    if (cached) return null; // PR exists (cached)
    // cached false = no PR last time, but re-check if TTL allows
  }
  if (cached === undefined) {
    try {
      var result = cp.execFileSync("gh_auto", ["pr", "list", "--head", branch, "--state", "open", "--json", "number", "--limit", "1"],
        { cwd: process.cwd(), encoding: "utf-8", timeout: 5000, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      var prs = JSON.parse(result || "[]");
      var hasPR = prs.length > 0;
      writeCache(branch, hasPR);
      if (hasPR) return null;
    } catch(e) {
      // gh not available or failed — don't block if we can't check
      writeCache(branch, true);
      return null;
    }
  }

  return {
    decision: "block",
    reason: "PR-FIRST GATE: Branch '" + branch + "' has no open pull request.\n" +
      "WHY: The dev team monitors progress via GitHub Mobile. Without a PR,\n" +
      "nobody knows you're working. Create the PR FIRST, then write specs and code.\n" +
      "Correct flow: task → PR → spec → failing tests → implement → e2e → merge\n" +
      "FIX: gh pr create --title \"T...: description\" --body \"## Summary\\nWIP\"\n" +
      "ALLOWED without PR: TODO.md, tasks.md, CHANGELOG.md edits"
  };
};
