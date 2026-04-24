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

// Cache header lines (first 8) per file path within a single loadModules() call.
// Each hook invocation is a fresh Node process, so no stale cache risk.
var _headerCache = {};

function getHeaderLines(filePath) {
  if (_headerCache[filePath]) return _headerCache[filePath];
  try {
    var content = fs.readFileSync(filePath, "utf-8");
    var lines = content.split("\n").slice(0, 8);
    _headerCache[filePath] = lines;
    return lines;
  } catch (e) { return []; }
}

/**
 * Parse "// TOOLS: Bash, Edit" from the first 8 lines of a module file.
 * When present, the module only runs for the listed tool names.
 * Returns array of tool names, or empty array (= runs for all tools).
 */
function parseToolTags(filePath) {
  var lines = getHeaderLines(filePath);
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^\/\/\s*TOOLS:\s*(.+)/i);
    if (match) {
      var tools = match[1].split(",");
      var result = [];
      for (var t = 0; t < tools.length; t++) {
        var tool = tools[t].replace(/^\s+|\s+$/g, "");
        if (tool) result.push(tool);
      }
      if (result.length > 0) return result;
    }
  }
  return [];
}

/**
 * Filter modules by tool name. Modules with a // TOOLS: tag are skipped
 * if the current tool doesn't match. Modules without the tag always pass.
 * @param {string[]} modulePaths
 * @param {string} toolName - current tool being invoked (e.g. "Bash", "Edit")
 * @returns {string[]} filtered paths
 */
function filterByTool(modulePaths, toolName) {
  if (!toolName) return modulePaths;
  var result = [];
  for (var i = 0; i < modulePaths.length; i++) {
    var tools = parseToolTags(modulePaths[i]);
    if (tools.length === 0) {
      result.push(modulePaths[i]); // no tag = runs for all tools
    } else if (tools.indexOf(toolName) !== -1) {
      result.push(modulePaths[i]);
    }
  }
  return result;
}

/**
 * Parse "// requires: mod1, mod2" from the first 8 lines of a module file.
 * Only matches module-name patterns (lowercase with hyphens, no spaces in names).
 * Returns array of required module base names (without .js).
 */
function parseRequires(filePath) {
  var lines = getHeaderLines(filePath);
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^\/\/\s*requires:\s*(.+)/i);
    if (match) {
      var deps = match[1].split(",").map(function(s) { return s.trim(); }).filter(Boolean);
      // Only accept valid module names (lowercase, hyphens, digits — no spaces/descriptions)
      var valid = deps.filter(function(d) { return /^[a-z0-9][-a-z0-9]*$/.test(d); });
      if (valid.length > 0) return valid;
    }
  }
  return [];
}

/**
 * Parse "// WORKFLOW: workflow-name" from the first 5 lines of a module file.
 * Supports comma-separated names: "// WORKFLOW: shtd, starter"
 * Returns array of workflow names, or empty array if no tag found.
 */
function parseWorkflowTags(filePath) {
  var lines = getHeaderLines(filePath);
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^\/\/\s*WORKFLOW:\s*(.+)/i);
    if (match) {
      var tags = match[1].split(",");
      var result = [];
      for (var t = 0; t < tags.length; t++) {
        var tag = tags[t].replace(/^\s+|\s+$/g, "");
        if (tag) result.push(tag);
      }
      if (result.length > 0) return result;
    }
  }
  return [];
}

// Backwards-compatible: returns first tag or null
function parseWorkflowTag(filePath) {
  var tags = parseWorkflowTags(filePath);
  return tags.length > 0 ? tags[0] : null;
}

// Cache workflow groups for 30s to avoid re-reading YAML on every hook invocation
var _groupsCache = null;
var _groupsCacheTime = 0;
var _groupsCacheKey = "";
var GROUPS_CACHE_TTL = 30000;

/**
 * Build the set of enabled/disabled workflow group names.
 *
 * Reads THREE sources (merged in order, later wins):
 *   1. Workflow YAML files — `enabled: true/false` field (default true if omitted)
 *   2. workflow-config.json — `{"name": true/false}` (project-level overrides global)
 *   3. .workflow-state.json — legacy step-based active workflow (always enabled)
 *
 * YAML search order (first found wins per name):
 *   1. $CLAUDE_PROJECT_DIR/workflows/*.yml
 *   2. ~/.claude/hooks/workflows/*.yml
 *   3. <hook-runner>/workflows/*.yml
 *
 * JSON search order (merged, project overrides global):
 *   1. ~/.claude/hooks/workflow-config.json (global)
 *   2. $CLAUDE_PROJECT_DIR/workflow-config.json (project override)
 *
 * Returns { enabled: {name: true}, disabled: {name: true} }
 */
function loadWorkflowGroups(projectDir) {
  var now = Date.now();
  if (_groupsCache && (now - _groupsCacheTime) < GROUPS_CACHE_TTL && _groupsCacheKey === projectDir) {
    return _groupsCache;
  }
  var home = process.env.HOME || process.env.USERPROFILE || "";
  var enabled = {};
  var disabled = {};

  // 1. Read workflow YAMLs for `enabled:` field
  var dirs = [
    path.join(projectDir, "workflows"),
    path.join(home, ".claude", "hooks", "workflows"),
    path.join(__dirname, "workflows"),
  ];
  var seen = {};
  for (var d = 0; d < dirs.length; d++) {
    if (!fs.existsSync(dirs[d])) continue;
    var files;
    try { files = fs.readdirSync(dirs[d]); } catch (e) { continue; }
    for (var f = 0; f < files.length; f++) {
      if (!(files[f].slice(-4) === ".yml" || files[f].slice(-5) === ".yaml")) continue;
      try {
        var content = fs.readFileSync(path.join(dirs[d], files[f]), "utf-8");
        var nameMatch = content.match(/^name:\s*(\S+)/m);
        if (!nameMatch) continue;
        var name = nameMatch[1];
        if (seen[name]) continue;
        seen[name] = true;
        var enabledMatch = content.match(/^enabled:\s*(true|false)/m);
        var isEnabled = enabledMatch ? enabledMatch[1] === "true" : true;
        if (isEnabled) {
          enabled[name] = true;
        } else {
          disabled[name] = true;
        }
      } catch (e) { /* skip unreadable */ }
    }
  }

  // 2. Read workflow-config.json (global then project — project overrides)
  var configPaths = [
    path.join(home, ".claude", "hooks", "workflow-config.json"),
    path.join(projectDir, "workflow-config.json"),
  ];
  for (var ci = 0; ci < configPaths.length; ci++) {
    try {
      var config = JSON.parse(fs.readFileSync(configPaths[ci], "utf-8"));
      var keys = Object.keys(config);
      for (var ki = 0; ki < keys.length; ki++) {
        if (config[keys[ki]] === true) {
          enabled[keys[ki]] = true;
          delete disabled[keys[ki]];
        } else if (config[keys[ki]] === false) {
          disabled[keys[ki]] = true;
          delete enabled[keys[ki]];
        }
      }
    } catch (e) { /* no config or parse error */ }
  }

  // 3. Legacy: .workflow-state.json active workflow (always counts as enabled)
  try {
    var statePath = path.join(projectDir, ".workflow-state.json");
    if (fs.existsSync(statePath)) {
      var state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      if (state && state.workflow) {
        enabled[state.workflow] = true;
        delete disabled[state.workflow];
      }
    }
  } catch (e) { /* ignore */ }

  var result = { enabled: enabled, disabled: disabled };
  _groupsCache = result;
  _groupsCacheTime = now;
  _groupsCacheKey = projectDir;
  return result;
}

/**
 * Filter out modules tagged with a WORKFLOW that isn't currently enabled.
 * Modules without a WORKFLOW tag always pass.
 *
 * Rules:
 *   - Modules WITHOUT a // WORKFLOW: tag always run (global, ungrouped)
 *   - Modules WITH a tag run only if that workflow group is enabled
 *   - A workflow group is enabled if its YAML has `enabled: true` (or omits the field)
 *   - A workflow group is disabled if its YAML has `enabled: false`
 *   - workflow-config.json overrides YAML (project overrides global)
 *   - If a module's workflow has NO YAML at all, the module is included (fail-open)
 */
function filterByWorkflow(modulePaths) {
  var projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  var groups = loadWorkflowGroups(projectDir);

  var result = [];
  for (var i = 0; i < modulePaths.length; i++) {
    var tags = parseWorkflowTags(modulePaths[i]);
    if (tags.length === 0) {
      result.push(modulePaths[i]); // untagged always passes
    } else {
      // Module passes if ANY of its workflow tags is enabled and not disabled
      var anyEnabled = false;
      for (var ti = 0; ti < tags.length; ti++) {
        if (groups.disabled[tags[ti]]) continue; // explicitly disabled
        if (groups.enabled[tags[ti]] || (!groups.disabled[tags[ti]] && !groups.enabled[tags[ti]])) {
          // Enabled, or unknown workflow (fail-open)
          anyEnabled = true;
          break;
        }
      }
      if (anyEnabled) result.push(modulePaths[i]);
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
 * @param {string} [toolName]  optional tool name for TOOLS: tag filtering (PreToolUse/PostToolUse)
 * @returns {string[]} absolute paths to .js module files
 */
module.exports = function loadModules(eventDir, toolName) {
  if (!fs.existsSync(eventDir)) return [];

  // 1. Global modules: top-level .js files
  var entries = fs.readdirSync(eventDir, { withFileTypes: true });
  var globalFiles = entries
    .filter(function(e) { return e.isFile() && e.name.indexOf(".js") === e.name.length - 3 && e.name.charAt(0) !== "_"; })
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
            .filter(function(f) { return f.indexOf(".js") === f.length - 3; })
            .sort()
            .map(function(f) { return path.join(projectModDir, f); });
          allFiles = globalFiles.concat(projectFiles);
        } catch (e) { /* skip */ }
      }
    }
  }

  // 3. Filter by active workflow — skip modules tagged for inactive workflows
  var afterWorkflow = filterByWorkflow(allFiles);

  // 4. Filter by tool name — skip modules that don't match the current tool
  var afterTool = toolName ? filterByTool(afterWorkflow, toolName) : afterWorkflow;

  // 5. Validate dependencies — skip modules with missing deps
  return validateDeps(afterTool);
};

// Exported for testing
module.exports.parseRequires = parseRequires;
module.exports.validateDeps = validateDeps;
module.exports.parseWorkflowTag = parseWorkflowTag;
module.exports.parseWorkflowTags = parseWorkflowTags;
module.exports.filterByWorkflow = filterByWorkflow;
module.exports.loadWorkflowGroups = loadWorkflowGroups;
module.exports.parseToolTags = parseToolTags;
module.exports.filterByTool = filterByTool;
