#!/usr/bin/env node
"use strict";
// Shared module loader for hook runners.
// Loads global modules (*.js at top level) + project-scoped modules
// (*.js in a subfolder matching the current project name).
//
// Layout:
//   run-modules/PreToolUse/
//     *.js                  <- global, runs for all projects
//     hackathon26/*.js      <- only when project dir basename = "hackathon26"
//     context-reset/*.js    <- only when project dir basename = "context-reset"

var fs = require("fs");
var path = require("path");

/**
 * Parse "// requires: mod1, mod2" from the first 5 lines of a module file.
 * Only matches module-name patterns (lowercase with hyphens, no spaces in names).
 * Returns array of required module base names (without .js).
 */
function parseRequires(filePath) {
  try {
    var content = fs.readFileSync(filePath, "utf-8");
    var lines = content.split("\n").slice(0, 5);
    for (var i = 0; i < lines.length; i++) {
      var match = lines[i].match(/^\/\/\s*requires:\s*(.+)/i);
      if (match) {
        var deps = match[1].split(",").map(function(s) { return s.trim(); }).filter(Boolean);
        // Only accept valid module names (lowercase, hyphens, digits — no spaces/descriptions)
        var valid = deps.filter(function(d) { return /^[a-z0-9][-a-z0-9]*$/.test(d); });
        if (valid.length > 0) return valid;
      }
    }
  } catch (e) { /* can't read, no deps */ }
  return [];
}

/**
 * Parse "// WORKFLOW: workflow-name" from the first 5 lines of a module file.
 * Returns the workflow name or null if no tag found.
 */
function parseWorkflowTag(filePath) {
  try {
    var content = fs.readFileSync(filePath, "utf-8");
    var lines = content.split("\n").slice(0, 5);
    for (var i = 0; i < lines.length; i++) {
      var match = lines[i].match(/^\/\/\s*WORKFLOW:\s*(\S+)/i);
      if (match) return match[1];
    }
  } catch (e) { /* can't read */ }
  return null;
}

/**
 * Filter out modules tagged with a WORKFLOW that isn't currently active.
 * Modules without a WORKFLOW tag always pass.
 */
function filterByWorkflow(modulePaths) {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  var wf = null;
  try {
    var candidates = [
      path.join(__dirname, "workflow.js"),
      path.join(path.dirname(__dirname), "workflow.js"),
    ];
    for (var c = 0; c < candidates.length; c++) {
      if (fs.existsSync(candidates[c])) { wf = require(candidates[c]); break; }
    }
  } catch (e) { /* no workflow engine */ }

  if (!wf) return modulePaths;

  var state = wf.readState(projectDir);
  var activeWorkflow = state ? state.workflow : null;

  var result = [];
  for (var i = 0; i < modulePaths.length; i++) {
    var tag = parseWorkflowTag(modulePaths[i]);
    if (!tag) {
      result.push(modulePaths[i]);
    } else if (tag === activeWorkflow) {
      result.push(modulePaths[i]);
    }
  }
  return result;
}

/**
 * Filter out modules whose dependencies are not present.
 * Warns to stderr about missing deps. Returns filtered list.
 */
function validateDeps(modulePaths) {
  var available = {};
  for (var i = 0; i < modulePaths.length; i++) {
    available[path.basename(modulePaths[i], ".js")] = true;
  }

  var result = [];
  for (var j = 0; j < modulePaths.length; j++) {
    var deps = parseRequires(modulePaths[j]);
    var missing = [];
    for (var k = 0; k < deps.length; k++) {
      if (!available[deps[k]]) missing.push(deps[k]);
    }
    if (missing.length > 0) {
      var modName = path.basename(modulePaths[j], ".js");
      process.stderr.write("hook-runner: skipping " + modName + " — missing deps: " + missing.join(", ") + "\n");
    } else {
      result.push(modulePaths[j]);
    }
  }
  return result;
}

/**
 * Return sorted list of module paths to load for the given event dir.
 * Validates module dependencies — modules with missing deps are skipped.
 * @param {string} eventDir  e.g. ~/.claude/hooks/run-modules/PreToolUse
 * @returns {string[]} absolute paths to .js module files
 */
module.exports = function loadModules(eventDir) {
  if (!fs.existsSync(eventDir)) return [];

  // 1. Global modules: top-level .js files
  var entries = fs.readdirSync(eventDir, { withFileTypes: true });
  var globalFiles = entries
    .filter(function(e) { return e.isFile() && e.name.endsWith(".js"); })
    .map(function(e) { return e.name; })
    .sort()
    .map(function(f) { return path.join(eventDir, f); });

  // 2. Project-scoped modules: subfolder matching project name
  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  var allFiles = globalFiles;

  if (projectDir) {
    var projectName = path.basename(projectDir);
    if (projectName !== "archive") {
      var projectModDir = path.join(eventDir, projectName);
      if (fs.existsSync(projectModDir) && fs.statSync(projectModDir).isDirectory()) {
        try {
          var projectFiles = fs.readdirSync(projectModDir)
            .filter(function(f) { return f.endsWith(".js"); })
            .sort()
            .map(function(f) { return path.join(projectModDir, f); });
          allFiles = globalFiles.concat(projectFiles);
        } catch (e) { /* skip */ }
      }
    }
  }

  // 3. Filter by active workflow — skip modules tagged for inactive workflows
  var afterWorkflow = filterByWorkflow(allFiles);

  // 4. Validate dependencies — skip modules with missing deps
  return validateDeps(afterWorkflow);
};

// Exported for testing
module.exports.parseRequires = parseRequires;
module.exports.validateDeps = validateDeps;
module.exports.parseWorkflowTag = parseWorkflowTag;
module.exports.filterByWorkflow = filterByWorkflow;
