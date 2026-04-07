// WORKFLOW: shtd
// WHY: A Claude session on ddei project ran ad-hoc commands for 45 minutes without
// SHTD active. When asked, it admitted "no, I just jumped straight into ad hoc commands."
// Globally enforced workflows must be active in EVERY project. No exceptions by default.
"use strict";
// requires: enforcement-gate
// PreToolUse gate: blocks ALL tool calls if a globally enforced workflow has been
// disabled at the project level. Global workflow-config.json is the source of truth.
// Modules tagged with that workflow won't load if disabled — this gate catches that.
//
// How enforcement works:
//   1. workflow-config.json (global, in ~/.claude/hooks/) lists enabled workflows
//   2. load-modules.js filters: only modules tagged with enabled workflows run
//   3. This gate catches projects that override global config with a local disable
//   4. Exception whitelist: ~/.claude/hooks/workflow-exceptions.json (manual only)
//
// Logs every check (pass/block/exception) to hook-log for audit trail.
var fs = require("fs");
var path = require("path");

// Cache per process invocation
var _checked = false;
var _result = null;

function getWorkflow() {
  var candidates = [
    path.join(__dirname, "..", "..", "workflow.js"),
    path.join(__dirname, "..", "workflow.js"),
    path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks", "workflow.js"),
  ];
  for (var i = 0; i < candidates.length; i++) {
    try { return require(candidates[i]); } catch (e) {}
  }
  return null;
}

function getHookLog() {
  var candidates = [
    path.join(__dirname, "..", "..", "hook-log.js"),
    path.join(__dirname, "..", "hook-log.js"),
    path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks", "hook-log.js"),
  ];
  for (var i = 0; i < candidates.length; i++) {
    try { return require(candidates[i]); } catch (e) {}
  }
  return null;
}

function readExceptions() {
  var home = process.env.HOME || process.env.USERPROFILE || "";
  var excPath = path.join(home, ".claude", "hooks", "workflow-exceptions.json");
  if (!fs.existsSync(excPath)) return {};
  try { return JSON.parse(fs.readFileSync(excPath, "utf-8")); } catch (e) { return {}; }
}

function isExcepted(projectDir, workflowName) {
  var exceptions = readExceptions();
  var normDir = projectDir.replace(/\\/g, "/").replace(/\/$/, "");
  var entry = exceptions[normDir] || exceptions[normDir + "/"];
  if (!entry) return false;
  if (entry.workflow === workflowName || entry.workflow === "*") return true;
  if (Array.isArray(entry.workflows) && entry.workflows.indexOf(workflowName) !== -1) return true;
  return false;
}

module.exports = function(input) {
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  var hookLog = getHookLog();

  // Cache: one check per hook runner invocation
  if (_checked) {
    if (hookLog && _result) {
      hookLog.logHook("PreToolUse", "workflow-compliance-gate", "block", {
        tool: input.tool_name, reason: "cached-block", project: projectDir
      });
    }
    return _result;
  }

  var wf = getWorkflow();
  if (!wf) { _checked = true; return null; }

  var home = process.env.HOME || process.env.USERPROFILE || "";
  var globalDir = path.join(home, ".claude", "hooks");
  var globalConfig = wf.readConfig(globalDir);
  var globallyEnforced = Object.keys(globalConfig).filter(function(k) { return globalConfig[k] === true; });

  if (globallyEnforced.length === 0 || !projectDir) {
    _checked = true;
    return null;
  }

  // Check: does any project-level config DISABLE a globally enforced workflow?
  var violations = [];
  var projectConfigPath = path.join(projectDir, "workflow-config.json");
  var projectConfig = {};
  if (fs.existsSync(projectConfigPath)) {
    try { projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8")); } catch (e) {}
  }

  for (var i = 0; i < globallyEnforced.length; i++) {
    var wfName = globallyEnforced[i];
    if (projectConfig[wfName] === false) {
      if (isExcepted(projectDir, wfName)) {
        if (hookLog) {
          hookLog.logHook("PreToolUse", "workflow-compliance-gate", "exception", {
            workflow: wfName, project: projectDir
          });
        }
        continue;
      }
      violations.push(wfName);
    }
  }

  // Log every check
  if (hookLog) {
    hookLog.logHook("PreToolUse", "workflow-compliance-gate", violations.length > 0 ? "block" : "pass", {
      project: projectDir,
      tool: input.tool_name,
      globallyEnforced: globallyEnforced,
      violations: violations
    });
  }

  _checked = true;

  if (violations.length > 0) {
    _result = {
      decision: "block",
      reason: "WORKFLOW COMPLIANCE: Globally enforced workflow(s) disabled at project level.\n" +
        "Violations: " + violations.join(", ") + "\n" +
        "WHY: All Claude sessions must follow globally enforced workflows. A session without\n" +
        "SHTD ran ad-hoc commands for 45 minutes — unspecced, untracked, unreviewable work.\n" +
        "FIX: Remove the project-level override:\n" +
        "  Delete or fix: " + projectConfigPath + "\n" +
        "  Global config requires: " + violations.join(", ") + " = true\n" +
        "Exception whitelist (manual only): ~/.claude/hooks/workflow-exceptions.json"
    };
    return _result;
  }

  return null;
};
