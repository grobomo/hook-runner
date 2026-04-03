// Enforce: local Claude manages fleet, workers implement features.
// Blocks Edit/Write to implementation files in any project with specs/.
// Blocks Bash commands that look like implementation work (npm test, node app, etc.)
// Only exception: CCC infrastructure (hooks, rules, fleet scripts, CF templates, dispatcher).
// All feature implementation goes to workers via: bash scripts/fleet/api-submit.sh "task"
var fs = require("fs");
var path = require("path");

module.exports = function(input) {
  var tool = input.tool_name;
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (!projectDir) return null;

  // Only enforce in hackathon26 project
  if (!projectDir.endsWith("/hackathon26")) return null;

  // --- Edit/Write gate ---
  if (tool === "Write" || tool === "Edit") {
    var targetFile = (input.tool_input || {}).file_path || "";
    if (!targetFile) return null;
    var normalTarget = targetFile.replace(/\\/g, "/");

    // Only block files that are NOT infrastructure/orchestration
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
      /claude-portable\//,
      /continuous-claude/,
      /git-dispatch/,
      /config-bundle\//,
      /fleet-config\.sh$/,
      /scripts\/fleet\//,
      /scripts\/aws\//,
      /scripts\/test\//,
      /scripts\/k8s\//,
      /scripts\/git-/,
      /cloudformation\//,
      /ccc-quickstart\//,
      /\/docs\//,
      /\/dashboard\//,
      /DEMO-RUNBOOK/,
      /demo-day-runbook/,
      /demo-fallback/,
      /team-chat\.py$/,
      /monitor-chat\.sh$/,
      /README\.md$/,
      /CONTRIBUTING\.md$/,
      /\.gitignore$/,
      /boothapp-bridge\//,
      /rone-teams-poller\//,
      /mcp-manager\//,
      /blueprint-extra/,
    ];
    for (var i = 0; i < allowPatterns.length; i++) {
      if (allowPatterns[i].test(normalTarget)) return null;
    }

    return {
      decision: "block",
      reason: "USE WORKERS — don't implement locally.\n" +
        "Submit to fleet: bash scripts/fleet/api-submit.sh \"<task description>\"\n" +
        "Check status:    bash scripts/fleet/api-status.sh\n" +
        "Then poll for results. Workers create PRs you can merge.\n" +
        "Local Claude handles: specs, fleet scripts, hooks, rules, orchestration ONLY.\n" +
        "Blocked: " + path.basename(targetFile)
    };
  }

  // --- Bash gate: block implementation-like commands ---
  if (tool === "Bash") {
    var cmd = (input.tool_input || {}).command || "";
    var normalized = cmd.replace(/\s+/g, " ").trim();

    // Block: directly running/testing boothapp code locally
    // Only match if boothapp appears in the command path, not in argument text
    if (/boothapp\/(node_modules|analysis|extension|audio|infra)/.test(normalized) && /(node|npm|python|pytest|jest|mocha)\b/.test(normalized)) {
      // Allow fleet scripts that reference boothapp
      if (/scripts\/(fleet|aws|test)\//.test(normalized)) return null;
      // Allow team-chat and other coordination scripts
      if (/team-chat\.py/.test(normalized)) return null;
      return {
        decision: "block",
        reason: "USE WORKERS — don't run boothapp code locally.\n" +
          "Submit the task: bash scripts/fleet/api-submit.sh \"<what you want tested>\"\n" +
          "Workers have the full boothapp repo and test infrastructure.\n" +
          "Blocked: " + cmd.substring(0, 120)
      };
    }
  }

  return null;
};
