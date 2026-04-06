// WORKFLOW: shtd
// WHY: Missing env vars caused silent failures deep in workflows.
"use strict";
// PreToolUse: block code edits if required environment variables are missing.
// Looks for .env.required in CLAUDE_PROJECT_DIR — one variable name per line.
// Lines starting with # are comments. Blank lines are ignored.
// Only blocks Write, Edit, and Bash (state-changing tools).
var fs = require("fs");
var path = require("path");

// Cache per project dir to avoid re-reading file on every tool call
var _cache = { dir: null, missing: null, checked: false };

function getMissingVars(projectDir) {
  if (_cache.checked && _cache.dir === projectDir) return _cache.missing;

  _cache.dir = projectDir;
  _cache.checked = true;
  _cache.missing = [];

  if (!projectDir) return _cache.missing;

  var reqFile = path.join(projectDir, ".env.required");
  if (!fs.existsSync(reqFile)) return _cache.missing;

  var lines;
  try {
    lines = fs.readFileSync(reqFile, "utf-8").split("\n");
  } catch (e) {
    return _cache.missing;
  }

  var missing = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === "#") continue;

    // Support "VAR_NAME # description" format
    var varName = line.split(/\s+#/)[0].trim();
    if (!varName) continue;

    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  _cache.missing = missing;
  return missing;
}

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Write" && tool !== "Edit" && tool !== "Bash") return null;

  var projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  var missing = getMissingVars(projectDir);

  if (missing.length === 0) return null;

  return {
    decision: "block",
    reason: "ENV VAR CHECK: Required environment variables are not set.\n" +
      "Missing: " + missing.join(", ") + "\n" +
      "Defined in: " + path.join(projectDir, ".env.required") + "\n" +
      "Set them in your shell or add to Claude Code settings.json env section."
  };
};
