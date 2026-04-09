// WORKFLOW: shtd
// WHY: Claude created specs and wrote code on branches without opening a PR first.
// The dev team monitors progress via GitHub Mobile notifications — without a PR,
// nobody knows work is happening. The correct flow is:
// 1) receive task  2) create PR  3) spec  4) failing tests  5) implement  6) e2e  7) merge
// This gate blocks spec/code edits on feature branches that don't have an open PR.
"use strict";
var cp = require("child_process");

// Cache PR check per branch per process lifetime (hooks are short-lived, but
// multiple modules run in one invocation — avoids redundant gh calls)
var prCache = {};

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

  // Check if an open PR exists for this branch
  if (prCache[branch] !== undefined) {
    if (prCache[branch]) return null; // PR exists
  } else {
    try {
      var result = cp.execSync(
        "gh_auto pr list --head " + branch + " --state open --json number --limit 1",
        { cwd: process.cwd(), encoding: "utf-8", timeout: 5000, windowsHide: true }
      ).trim();
      var prs = JSON.parse(result || "[]");
      prCache[branch] = prs.length > 0;
      if (prCache[branch]) return null;
    } catch(e) {
      // gh not available or failed — don't block if we can't check
      prCache[branch] = true;
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
