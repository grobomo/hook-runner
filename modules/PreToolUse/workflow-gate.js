// TOOLS: Edit, Write
// WORKFLOW: shtd, gsd
"use strict";
// WHY: Steps in a workflow were skipped — build ran before setup, deploy before test.
// Workflow gate: enforces step order in active workflows.
// If a workflow is active, the current step's gate must be satisfied before code edits.
// Allowed paths (TODO.md, specs/, tests/, etc.) bypass the gate.

var path = require('path');

// Allowed path patterns — edits to these never blocked by workflow gate
var ALLOWED = [
  /TODO\.md/i, /CLAUDE\.md/i, /SESSION_STATE/i, /\.claude\//i,
  /rules\//i, /\.github\//i, /\.gitignore/i, /archive\//i,
  /specs\//i, /[\/\\]tests?[\/\\]/i, /[\/\\]config[\/\\]/i,
  /package\.json/i, /install\.(sh|js|py)/i, /setup\.(sh|js|py)/i,
  /workflows\//i, /\.workflow-state/i,
];

function getWorkflow() {
  // Resolve workflow.js relative to this module's installed location
  // When installed: ~/.claude/hooks/run-modules/PreToolUse/workflow-gate.js
  //   → workflow.js at ~/.claude/hooks/workflow.js (copied by installer)
  //   → or hook-runner repo at ../../workflow.js
  var candidates = [
    path.join(__dirname, '..', '..', 'workflow.js'),
    path.join(__dirname, '..', 'workflow.js'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'hooks', 'workflow.js'),
  ];
  for (var i = 0; i < candidates.length; i++) {
    try { return require(candidates[i]); } catch(e) {}
  }
  return null;
}

module.exports = function(input) {
  var tool = input && input.tool_name;
  if (tool !== 'Write' && tool !== 'Edit') return null;

  var filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || '';
  var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  // Check allowed paths
  for (var i = 0; i < ALLOWED.length; i++) {
    if (ALLOWED[i].test(filePath)) return null;
  }

  var wf = getWorkflow();
  if (!wf) return null;

  var state = wf.readState(projectDir);
  if (!state) return null; // No active workflow

  var current = wf.currentStep(projectDir);
  if (!current) return null; // All steps done

  var check = wf.checkGate(current, projectDir);
  if (!check.allowed) {
    var reasons = (check.reasons || []).join('; ');
    return {
      decision: 'block',
      reason: '[workflow] "' + state.workflow + '" step "' + current + '" blocked: ' + reasons
    };
  }

  return null;
};
