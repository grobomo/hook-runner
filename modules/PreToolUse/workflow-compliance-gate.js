// WORKFLOW: shtd, gsd
// WHY: A Claude session on ddei project ran ad-hoc commands for 45 minutes without
// SHTD active. When asked, it admitted "no, I just jumped straight into ad hoc commands."
// Globally enforced workflows must be active in EVERY project. No exceptions by default.
// T530: Replaced require(workflow.js) + require(hook-log.js) with direct JSON reads.
// Old approach loaded two heavy modules (~10ms each) on every tool call (936 calls/session).
// Now: reads workflow-config.json directly + file-based cache with mtime key. Only loads
// hook-log.js on block/exception (rare), not the common pass path. Saves ~14ms/call.
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
var fs = require("fs");
var path = require("path");
var os = require("os");

// T530: File-based cache — avoids re-reading config files on every tool call.
// Cache key = mtime of global + project config files. Invalidates on config change.
var CACHE_FILE = path.join(os.tmpdir(), "hook-runner-wf-compliance-cache.json");
var CACHE_TTL = 60000; // 1 minute — config changes are rare

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); } catch(e) { return null; }
}

function getMtime(filePath) {
  try { return fs.statSync(filePath).mtimeMs; } catch(e) { return 0; }
}

function isExcepted(exceptions, projectDir, workflowName) {
  var normDir = projectDir.replace(/\\/g, "/").replace(/\/$/, "");
  var entry = exceptions[normDir] || exceptions[normDir + "/"];
  if (!entry) return false;
  if (entry.workflow === workflowName || entry.workflow === "*") return true;
  if (Array.isArray(entry.workflows) && entry.workflows.indexOf(workflowName) !== -1) return true;
  return false;
}

// Lazy-load hook-log only when needed (block/exception — not the common pass path)
var _hookLog = undefined;
function getHookLog() {
  if (_hookLog !== undefined) return _hookLog;
  var candidates = [
    path.join(__dirname, "..", "..", "hook-log.js"),
    path.join(__dirname, "..", "hook-log.js"),
    path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks", "hook-log.js"),
  ];
  for (var i = 0; i < candidates.length; i++) {
    try { _hookLog = require(candidates[i]); return _hookLog; } catch (e) {}
  }
  _hookLog = null;
  return null;
}

module.exports = function(input) {
  var projectDir = (process.env.CLAUDE_PROJECT_DIR || "").replace(/\\/g, "/");
  if (!projectDir) return null;

  var home = process.env.HOME || process.env.USERPROFILE || "";
  var globalConfigPath = path.join(home, ".claude", "hooks", "workflow-config.json");
  var projectConfigPath = path.join(projectDir, "workflow-config.json");

  // T530: Fast path — check cache before reading any config files
  var now = Date.now();
  var globalMtime = getMtime(globalConfigPath);
  var projectMtime = getMtime(projectConfigPath);
  var cacheKey = globalMtime + ":" + projectMtime + ":" + projectDir;

  try {
    var cached = readJsonSafe(CACHE_FILE);
    if (cached && cached.key === cacheKey && (now - cached.ts) < CACHE_TTL) {
      // Cache hit — return cached result (null for pass, object for block)
      if (cached.result) {
        var hookLog = getHookLog();
        if (hookLog) {
          hookLog.logHook("PreToolUse", "workflow-compliance-gate", "block", {
            tool: input.tool_name, reason: "cached-block", project: projectDir
          });
        }
      }
      return cached.result;
    }
  } catch(e) { /* cache read failed — do full check */ }

  // Read global config directly (no require(workflow.js) needed)
  var globalConfig = readJsonSafe(globalConfigPath) || {};
  var globallyEnforced = Object.keys(globalConfig).filter(function(k) { return globalConfig[k] === true; });

  if (globallyEnforced.length === 0) {
    try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ key: cacheKey, ts: now, result: null })); } catch(e) {}
    return null;
  }

  // Check: does any project-level config DISABLE a globally enforced workflow?
  var projectConfig = readJsonSafe(projectConfigPath) || {};
  var violations = [];
  var excPath = path.join(home, ".claude", "hooks", "workflow-exceptions.json");

  for (var i = 0; i < globallyEnforced.length; i++) {
    var wfName = globallyEnforced[i];
    if (projectConfig[wfName] === false) {
      var exceptions = readJsonSafe(excPath) || {};
      if (isExcepted(exceptions, projectDir, wfName)) {
        var hookLog2 = getHookLog();
        if (hookLog2) {
          hookLog2.logHook("PreToolUse", "workflow-compliance-gate", "exception", {
            workflow: wfName, project: projectDir
          });
        }
        continue;
      }
      violations.push(wfName);
    }
  }

  var result = null;
  if (violations.length > 0) {
    result = {
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
    var hookLog3 = getHookLog();
    if (hookLog3) {
      hookLog3.logHook("PreToolUse", "workflow-compliance-gate", "block", {
        project: projectDir, tool: input.tool_name,
        globallyEnforced: globallyEnforced, violations: violations
      });
    }
  }

  // Write cache (pass or block)
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify({ key: cacheKey, ts: now, result: result })); } catch(e) {}

  return result;
};
