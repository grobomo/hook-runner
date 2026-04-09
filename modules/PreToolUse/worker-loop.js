// WORKFLOW: dispatcher-worker
// WHY: Workers in the CCC fleet would create PRs before tests passed,
// then merge from mobile without verifying. This gate blocks PR creation
// until the task's e2e test exits 0.
"use strict";
// requires: enforcement-gate
// Worker loop gate: blocks `gh pr create` unless the e2e test for the
// current task (extracted from branch name) has been run and passed.
// Looks for scripts/test/test-TXXX*.sh, runs it, blocks if exit != 0.
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Bash") return null;

  var cmd = "";
  try { cmd = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).command || ""; } catch(e) { cmd = (input.tool_input || {}).command || ""; }

  // Only gate PR creation
  if (!/gh\s+pr\s+create/.test(cmd)) return null;

  // Extract task ID from current branch name
  var branch = (input._git && input._git.branch) || "";
  if (!branch) {
    try {
      // Read .git/HEAD directly — avoids spawning git (slow on Windows)
      var projectDir0 = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, "/");
      var headContent = fs.readFileSync(path.join(projectDir0, ".git", "HEAD"), "utf-8").trim();
      branch = headContent.indexOf("ref: refs/heads/") === 0 ? headContent.slice(16) : "";
    } catch(e) { return null; }
  }

  var taskMatch = branch.match(/T(\d{3,4})/i);
  if (!taskMatch) return null;
  var taskId = "T" + taskMatch[1];

  // Find test file for this task
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, "/");
  var roots = [projectDir];

  // Also check target file's git root
  var gitRoot = "";
  try {
    gitRoot = cp.execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8", timeout: 5000, windowsHide: true }).trim().replace(/\\/g, "/");
    if (roots.indexOf(gitRoot) === -1) roots.push(gitRoot);
  } catch(e) {}

  var testScript = null;
  for (var ri = 0; ri < roots.length; ri++) {
    var testDir = path.join(roots[ri], "scripts", "test");
    if (!fs.existsSync(testDir)) continue;
    try {
      var files = fs.readdirSync(testDir);
      for (var fi = 0; fi < files.length; fi++) {
        var pattern = new RegExp("^test-" + taskId, "i");
        if (pattern.test(files[fi]) && files[fi].indexOf(".sh", files[fi].length - 3) !== -1) {
          testScript = path.join(testDir, files[fi]);
          break;
        }
      }
    } catch(e) {}
    if (testScript) break;
  }

  if (!testScript) {
    // No test file found — warn but don't block (test-checkpoint-gate handles this)
    return null;
  }

  // Check marker file first (avoid re-running if already passed)
  var markerDir = path.join(projectDir, ".test-results");
  var markerFile = path.join(markerDir, taskId + ".passed");
  if (fs.existsSync(markerFile)) {
    return null; // Already passed
  }

  // Run the test
  try {
    cp.execFileSync("bash", [testScript], {
      encoding: "utf-8",
      timeout: 120000, // 2 min max
      cwd: projectDir,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    // Test passed — write marker
    if (!fs.existsSync(markerDir)) fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(markerFile, new Date().toISOString() + "\n");
    return null;
  } catch(e) {
    var output = (e.stdout || "") + "\n" + (e.stderr || "");
    // Trim to last 500 chars to avoid huge block messages
    if (output.length > 500) output = "..." + output.substring(output.length - 500);

    return {
      decision: "block",
      reason: "WORKER LOOP: Test failed for " + taskId + " — fix before creating PR.\n" +
        "WHY: Workers must prove their implementation works before creating a PR.\n" +
        "The test is the acceptance criteria — if it doesn't pass, the work isn't done.\n" +
        "Script: " + testScript + "\n" +
        "Output:\n" + output.trim() + "\n\n" +
        "FIX: Fix the failing test, then retry `gh pr create`."
    };
  }
};
