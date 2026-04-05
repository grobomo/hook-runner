// WORKFLOW: shtd
// WHY: PRs merged from mobile had no tests, breaking production.
"use strict";
// requires: enforcement-gate, spec-gate
// Test checkpoint gate (renamed from gsd-gate): blocks implementation unless
// unchecked tasks have test coverage. Checks two sources:
// 1. specs/*/tasks.md — phases with unchecked tasks must have **Checkpoint**: with test script
// 2. Auto-detect — scripts/test/test-TXXX*.sh files count as test coverage for task TXXX
// This relaxes the original gsd-gate so TODO.md-only projects work if test files exist.
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var targetFile = "";
  try { targetFile = (typeof input.tool_input === "string" ? JSON.parse(input.tool_input) : input.tool_input || {}).file_path || ""; } catch(e) { targetFile = (input.tool_input || {}).file_path || ""; }
  if (!targetFile) return null;
  var norm = targetFile.replace(/\\/g, "/");

  // Allow bootstrap/config/spec/test files
  var allowPatterns = [
    /TODO\.md$/, /SESSION_STATE\.md$/, /CLAUDE\.md$/,
    /\.claude\//, /\/specs\//, /\.planning\//, /\.specify\//,
    /\.github\//, /\/hooks\//, /\/rules\//,
    /\.gitignore$/, /\.json$/,
    /scripts\/test\//,
  ];
  for (var i = 0; i < allowPatterns.length; i++) {
    if (allowPatterns[i].test(norm)) return null;
  }

  // Allow user home config
  var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
  if (home && norm.indexOf(home + "/.claude/") === 0) return null;

  // Find project roots
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var roots = [];
  if (projectDir) roots.push(projectDir);

  var dir = path.dirname(targetFile);
  for (var d = 0; d < 20; d++) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      var r = dir.replace(/\\/g, "/");
      if (roots.indexOf(r) === -1) roots.push(r);
      break;
    }
    var parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Build set of task IDs that have auto-detected test files
  var autoTestedTasks = {};
  for (var ai = 0; ai < roots.length; ai++) {
    var testDir = path.join(roots[ai], "scripts", "test");
    if (!fs.existsSync(testDir)) continue;
    try {
      var testFiles = fs.readdirSync(testDir);
      for (var ti = 0; ti < testFiles.length; ti++) {
        var m = testFiles[ti].match(/^test-T(\d+)/i);
        if (m) autoTestedTasks["T" + m[1]] = true;
      }
    } catch(e) {}
  }

  // Check specs/*/tasks.md for unchecked tasks without test coverage
  var tasksWithoutTests = [];
  for (var ri = 0; ri < roots.length; ri++) {
    var specsDir = path.join(roots[ri], "specs");
    if (!fs.existsSync(specsDir)) continue;
    try {
      var specDirs = fs.readdirSync(specsDir);
      for (var j = 0; j < specDirs.length; j++) {
        var tf = path.join(specsDir, specDirs[j], "tasks.md");
        if (!fs.existsSync(tf)) continue;

        var content = fs.readFileSync(tf, "utf-8");
        if (!/- \[ \] T\d+/.test(content)) continue;

        // Check each phase
        var phases = content.split(/^## Phase/m);
        for (var p = 1; p < phases.length; p++) {
          var phase = phases[p];
          if (!/- \[ \] T\d+/.test(phase)) continue;

          // Extract unchecked task IDs in this phase
          var uncheckedInPhase = [];
          var taskMatches = phase.match(/- \[ \] (T\d+)/g);
          if (taskMatches) {
            for (var tm = 0; tm < taskMatches.length; tm++) {
              var tid = taskMatches[tm].match(/T\d+/)[0];
              uncheckedInPhase.push(tid);
            }
          }

          // Check if phase has checkpoint with test script
          var checkpointMatch = phase.match(/\*\*Checkpoint\*\*:?([\s\S]*?)(?=\n---|\n## |$)/);
          var hasCheckpointTest = false;
          if (checkpointMatch) {
            var checkpoint = checkpointMatch[1];
            hasCheckpointTest = /scripts\/test\//.test(checkpoint) || /bash\s+scripts\//.test(checkpoint) || /exits?\s+0/.test(checkpoint);
          }

          if (hasCheckpointTest) continue;

          // Check if all unchecked tasks have auto-detected test files
          var allAutoTested = uncheckedInPhase.length > 0;
          for (var ut = 0; ut < uncheckedInPhase.length; ut++) {
            if (!autoTestedTasks[uncheckedInPhase[ut]]) {
              allAutoTested = false;
              break;
            }
          }

          if (!allAutoTested) {
            var phaseName = phase.substring(0, phase.indexOf("\n")).trim();
            tasksWithoutTests.push("Phase " + phaseName + " — no Checkpoint test and no scripts/test/test-TXXX*.sh for unchecked tasks");
          }
        }
      }
    } catch(e) {}
  }

  // Also check TODO.md tasks — if project uses TODO.md only, check that
  // unchecked tasks have matching test files
  for (var ri2 = 0; ri2 < roots.length; ri2++) {
    var todoPath = path.join(roots[ri2], "TODO.md");
    if (!fs.existsSync(todoPath)) continue;
    var specsExist = fs.existsSync(path.join(roots[ri2], "specs"));

    // Only enforce TODO.md test check if no specs/ exists (pure TODO.md project)
    // Projects with specs/ get checked via the phase logic above
    if (specsExist) continue;

    try {
      var todoContent = fs.readFileSync(todoPath, "utf-8");
      var todoUnchecked = todoContent.match(/- \[ \] (T\d+)/g);
      if (!todoUnchecked) continue;

      var missingTests = [];
      for (var tu = 0; tu < todoUnchecked.length; tu++) {
        var taskId = todoUnchecked[tu].match(/T\d+/)[0];
        if (!autoTestedTasks[taskId]) {
          missingTests.push(taskId);
        }
      }

      // Only block if NONE of the unchecked tasks have tests
      // (allow progress if at least some tasks have tests)
      if (missingTests.length === todoUnchecked.length) {
        tasksWithoutTests.push("TODO.md — no test files found for any unchecked task (" + missingTests.join(", ") + ")");
      }
    } catch(e) {}
  }

  if (tasksWithoutTests.length > 0) {
    return {
      decision: "block",
      reason: "TEST CHECKPOINT GATE: Tasks missing test coverage:\n" +
        tasksWithoutTests.map(function(t) { return "  - " + t; }).join("\n") + "\n\n" +
        "WHY: During the hackathon, PRs merged from mobile had no tests and broke production.\n" +
        "Every task must have an automated e2e test as proof of completion — no manual verification.\n" +
        "Tests are what make autonomous fleet workers reliable: a worker can't merge broken code\n" +
        "if a test must pass first.\n\n" +
        "FIX: Create scripts/test/test-TXXX-<name>.sh for each task, or add\n" +
        "     `**Checkpoint**: `bash scripts/test/<test>.sh` exits 0` to spec phases.\n" +
        "Blocked: " + path.basename(targetFile)
    };
  }

  return null;
};
