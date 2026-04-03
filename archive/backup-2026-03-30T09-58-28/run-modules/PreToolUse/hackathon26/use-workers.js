// Enforce: local Claude specs and plans, workers implement.
// Blocks Edit/Write to implementation files when tasks.md exists.
// Only exception: developing CCC worker infrastructure itself (hooks, rules, orchestration).
// All implementation goes to CCC workers via bridge.py.
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Edit") return null;

  var targetFile = (input.tool_input || {}).file_path || "";
  if (!targetFile) return null;
  var normalTarget = targetFile.replace(/\\/g, "/");

  // Only block files inside the current project directory
  var normalProjectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (normalProjectDir && !normalTarget.startsWith(normalProjectDir)) return null;

  // Always allow: specs, plans, rules, hooks, config, docs, CCC worker dev
  var allowPatterns = [
    /TODO\.md$/,
    /SESSION_STATE\.md$/,
    /CLAUDE\.md$/,
    /\.claude\//,
    /\/specs\//,
    /\.planning\//,
    /\.specify\//,
    /\.github\//,
    /\/hooks\//,
    /\/rules\//,
    /checklists\//,
    /claude-portable\//,        // CCC worker infrastructure
    /continuous-claude/,        // continuous-claude scripts
    /git-dispatch/,             // dispatcher code
    /config-bundle\//,          // bundle skill
    /fleet-config\.sh$/,        // fleet config
    /scripts\/fleet\//,         // fleet orchestration scripts
    /scripts\/aws\//,           // AWS infra scripts
    /scripts\/test\//,          // test scripts
    /scripts\/k8s\//,           // K8s scripts
    /scripts\/git-/,            // git automation scripts
    /cloudformation\//,         // CF templates
    /\/docs\//,                 // documentation and diagrams
    /DEMO-RUNBOOK/,             // demo runbook
    /boothapp-bridge\//,        // bridge relay infrastructure
    /rone-teams-poller\//,      // RONE poller infrastructure
  ];
  for (var i = 0; i < allowPatterns.length; i++) {
    if (allowPatterns[i].test(normalTarget)) return null;
  }

  // Check if tasks.md exists — if so, implementation should go to workers
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (!projectDir) return null;

  var specsDir = path.join(projectDir, "specs");
  if (!fs.existsSync(specsDir)) return null;

  var hasTasksMd = false;
  try {
    var specDirs = fs.readdirSync(specsDir);
    for (var j = 0; j < specDirs.length; j++) {
      if (fs.existsSync(path.join(specsDir, specDirs[j], "tasks.md"))) {
        hasTasksMd = true;
        break;
      }
    }
  } catch (e) { /* skip */ }

  if (!hasTasksMd) return null;

  return {
    decision: "block",
    reason: "USE WORKERS: tasks.md exists — implementation goes to CCC workers, not local.\n" +
      "WHY: Workers create PRs visible on GitHub Mobile. Local edits bypass the PR trail.\n" +
      "The team can't see or review work done locally — only worker PRs are visible.\n" +
      "FIX: Submit via: bash scripts/fleet/submit.sh \"<task>\" — workers will create PRs the team can monitor.\n" +
      "Local Claude handles: specs, plans, tasks, rules, hooks, orchestration only.\n" +
      "Blocked: " + path.basename(targetFile)
  };
};
