// TOOLS: Edit, Write
// WORKFLOW: shtd, gsd
// WHY: Claude implemented features without any task tracking, making progress invisible.
// Tracked workflow gate: blocks implementation code unless the project has a
// tracked task workflow (specs/tasks.md with T### checkboxes).
//
// WHY THIS EXISTS:
// Every code change must map to a tracked task so the dev team can see progress
// via GitHub PRs. Untracked work is invisible — nobody can review, monitor, or
// understand what happened. The task trail IS the project history.
//
// BOOTSTRAP: New projects need to create specs/tasks.md before implementation.
// This gate allows all scaffolding files (TODO.md, specs/, .github/, etc.) so
// you can set up the project structure first. Once you have specs with tasks,
// implementation code is unblocked.
//
// Returns null to pass, {decision:"block", reason:"..."} to block.
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  // API-dispatched tasks skip this gate (workers implement directly)
  if (process.env.SKIP_SPEC_GATE === "1" || process.env.CONTINUOUS_CLAUDE === "1") return null;

  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var targetFile = (input.tool_input || {}).file_path || "";
  if (!targetFile) return null;
  var normalTarget = targetFile.replace(/\\/g, "/");

  // Allow user home config (not a project)
  var home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
  if (home && normalTarget.replace(/\\/g, "/").indexOf(home + "/.claude/") === 0) return null;

  // Allow bootstrap/config/planning files — these are pre-implementation.
  // You need to be able to CREATE specs and scaffolding before they can gate you.
  var allowPatterns = [
    /TODO\.md$/, /SESSION_STATE\.md$/, /CLAUDE\.md$/,
    /\.claude\//, /\/specs\//, /\.planning\//, /\.specify\//,
    /\.github\//, /\/hooks\//, /\/rules\//,
    /\.gitignore$/, /\.json$/,  // package.json, tsconfig, etc.
    /scripts\/test\//,
  ];
  for (var i = 0; i < allowPatterns.length; i++) {
    if (allowPatterns[i].test(normalTarget)) return null;
  }

  // Find git root from target file
  var gitRoot = null;
  var dir = path.dirname(targetFile);
  for (var d = 0; d < 20; d++) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      gitRoot = dir;
      break;
    }
    var parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // No git root — enforcement-gate handles that, let this pass
  if (!gitRoot) return null;

  // Check for tracked task workflow: specs/<feature>/tasks.md with T### checkboxes
  var specsDir = path.join(gitRoot, "specs");
  if (fs.existsSync(specsDir)) {
    try {
      var specDirs = fs.readdirSync(specsDir);
      for (var j = 0; j < specDirs.length; j++) {
        var tf = path.join(specsDir, specDirs[j], "tasks.md");
        if (!fs.existsSync(tf)) continue;
        try {
          var content = fs.readFileSync(tf, "utf-8");
          if (/^- \[[ x]\] T\d{3}/m.test(content)) return null;
        } catch (e) { /* skip */ }
      }
    } catch (e) { /* skip */ }
  }

  // Also accept TODO.md with T### format as a lightweight alternative
  var projectDir = process.env.CLAUDE_PROJECT_DIR || gitRoot;
  var todoPath = path.join(projectDir, "TODO.md");
  if (fs.existsSync(todoPath)) {
    try {
      var todoContent = fs.readFileSync(todoPath, "utf-8");
      if (/^- \[[ x]\] T\d{3}/m.test(todoContent)) return null;
    } catch (e) { /* skip */ }
  }

  return {
    decision: "block",
    reason: "TRACKED WORKFLOW GATE: No tracked tasks found.\n" +
      "WHY: Every code change must map to a spec task so the dev team can see\n" +
      "progress via GitHub PRs. Untracked work is invisible — nobody can review,\n" +
      "monitor, or understand what changed or why.\n" +
      "FIX (new project):\n" +
      "  1. Create feature branch: git checkout -b <NNN>-<verb-noun>\n" +
      "  2. Generate tasks: /speckit.specify → /speckit.plan → /speckit.tasks\n" +
      "  3. This creates specs/<feature>/tasks.md with T### checkboxes\n" +
      "  4. Then implementation code is unblocked\n" +
      "FIX (existing project):\n" +
      "  Add the work to specs/<feature>/tasks.md before writing code.\n" +
      "Blocked: " + path.basename(targetFile)
  };
};
