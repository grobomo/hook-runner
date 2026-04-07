// WORKFLOW: shtd
// WHY: On context reset, Claude loses track of which workflows are active.
// SessionStart: inject active workflow summary so Claude knows all active constraints.
module.exports = function(input) {
  var path = require("path");
  var wf;
  try {
    var candidates = [
      path.join(__dirname, "..", "..", "workflow.js"),
      path.join(__dirname, "..", "workflow.js"),
    ];
    for (var c = 0; c < candidates.length; c++) {
      try { var fs = require("fs"); if (fs.existsSync(candidates[c])) { wf = require(candidates[c]); break; } } catch(e) {}
    }
  } catch(e) {}
  if (!wf) return null;

  var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  var home = process.env.HOME || process.env.USERPROFILE || "";
  var globalDir = path.join(home, ".claude", "hooks");

  // Merge global + project config
  var globalConfig = wf.readConfig(globalDir);
  var projectConfig = wf.readConfig(projectDir);
  var merged = {};
  var gk = Object.keys(globalConfig);
  for (var i = 0; i < gk.length; i++) merged[gk[i]] = globalConfig[gk[i]];
  var pk = Object.keys(projectConfig);
  for (var j = 0; j < pk.length; j++) merged[pk[j]] = projectConfig[pk[j]];

  var enabled = Object.keys(merged).filter(function(k) { return merged[k] === true; });
  if (enabled.length === 0) return null;

  // Load workflow definitions for descriptions and module counts
  var workflows;
  try { workflows = wf.findWorkflows(projectDir); } catch(e) { workflows = []; }
  var wfMap = {};
  for (var w = 0; w < workflows.length; w++) wfMap[workflows[w].name] = workflows[w];

  var lines = ["ACTIVE WORKFLOWS (" + enabled.length + "):"];
  for (var e = 0; e < enabled.length; e++) {
    var name = enabled[e];
    var def = wfMap[name];
    if (def) {
      var modCount = (def.modules || []).length;
      lines.push("  - " + name + " (" + modCount + " modules) — " + (def.description || ""));
    } else {
      lines.push("  - " + name + " (no definition found)");
    }
  }

  // Check for active step-based workflow
  var state;
  try { state = wf.readState(projectDir); } catch(e) {}
  if (state && state.workflow) {
    var current;
    try { current = wf.currentStep(projectDir); } catch(e) {}
    lines.push("ACTIVE STEP WORKFLOW: " + state.workflow + " — current step: " + (current || "complete"));
  }

  return { text: lines.join("\n") };
};
