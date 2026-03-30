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
 * Return sorted list of module paths to load for the given event dir.
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
  if (!projectDir) return globalFiles;

  var projectName = path.basename(projectDir);
  if (projectName === "archive") return globalFiles;
  var projectModDir = path.join(eventDir, projectName);
  if (!fs.existsSync(projectModDir) || !fs.statSync(projectModDir).isDirectory()) {
    return globalFiles;
  }

  var projectFiles;
  try {
    projectFiles = fs.readdirSync(projectModDir)
      .filter(function(f) { return f.endsWith(".js"); })
      .sort()
      .map(function(f) { return path.join(projectModDir, f); });
  } catch (e) {
    projectFiles = [];
  }

  // Global first, then project-scoped (so project modules can override/extend)
  return globalFiles.concat(projectFiles);
};
