"use strict";
// requires: enforcement-gate, spec-gate
// GSD gate: blocks implementation unless the current spec task has a real e2e test
// as completion criteria. Every task phase must reference a scripts/test/ script.
// The test is the GSD completion criteria — no manual verification allowed.
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
  if (home && norm.startsWith(home + "/.claude/")) return null;

  // Find tasks.md files
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

  // Find tasks.md with unchecked tasks
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
        if (!/- \[ \] T\d+/.test(content)) continue; // no unchecked tasks

        // Check each Checkpoint section has a test script reference
        var phases = content.split(/^## Phase/m);
        for (var p = 1; p < phases.length; p++) {
          var phase = phases[p];
          // Only check phases with unchecked tasks
          if (!/- \[ \] T\d+/.test(phase)) continue;

          var checkpointMatch = phase.match(/\*\*Checkpoint\*\*:?([\s\S]*?)(?=\n---|\n## |$)/);
          if (!checkpointMatch) {
            tasksWithoutTests.push("Phase " + phase.substring(0, phase.indexOf("\n")).trim() + " — missing Checkpoint section");
            continue;
          }

          var checkpoint = checkpointMatch[1];
          // Must reference a test script (scripts/test/, bash scripts/, or exits 0)
          if (!/scripts\/test\//.test(checkpoint) && !/bash\s+scripts\//.test(checkpoint) && !/exits?\s+0/.test(checkpoint)) {
            tasksWithoutTests.push("Phase " + phase.substring(0, phase.indexOf("\n")).trim() + " — Checkpoint has no test script (needs scripts/test/ reference)");
          }
        }
      }
    } catch(e) {}
  }

  if (tasksWithoutTests.length > 0) {
    return {
      decision: "block",
      reason: "GSD GATE: Spec tasks missing completion test scripts:\n" +
        tasksWithoutTests.map(function(t) { return "  - " + t; }).join("\n") + "\n\n" +
        "WHY: PRs without automated tests can't be trusted. The team merges PRs from mobile —\n" +
        "they need confidence that merged work actually works. Tests are the proof.\n" +
        "FIX: Add `**Checkpoint**: ... `bash scripts/test/<test>.sh` exits 0` to each phase.\n" +
        "Blocked: " + path.basename(targetFile)
    };
  }

  return null;
};
