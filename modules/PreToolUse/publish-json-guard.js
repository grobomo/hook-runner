// WORKFLOW: shtd, starter
// WHY: ep-incident-response (private customer data) was published to grobomo (public).
// Root cause: nothing prevented Claude from editing publish.json or git remotes,
// which control which GitHub account receives pushes. This gate blocks modifications
// to publish.json, git remote config, and git remote commands.
// Creating a NEW publish.json (Write when file doesn't exist) is allowed — CLAUDE.md
// requires every git project to have one.
"use strict";

var fs = require("fs");

module.exports = function(input) {
  var tool = input.tool_name;

  // Guard file edits (Edit always blocked, Write only if file already exists)
  if (tool === "Edit" || tool === "Write") {
    var filePath = (input.tool_input && (input.tool_input.file_path || "")) || "";
    filePath = filePath.replace(/\\/g, "/");

    if (/\.github\/publish\.json$/i.test(filePath)) {
      // Allow Write (creation) when the file doesn't exist yet
      if (tool === "Write" && !fs.existsSync(filePath)) {
        return null;
      }
      return {
        decision: "block",
        reason: "[publish-json-guard] publish.json controls GitHub account routing.\n" +
          "Editing it can redirect pushes to the wrong org (e.g. private data \u2192 public repo).\n" +
          "If this change is intentional, the user must edit the file manually."
      };
    }
  }

  // Guard bash commands that modify git remote or publish.json
  // Only check the primary command, not strings embedded in heredocs/python/etc.
  if (tool === "Bash") {
    var cmd = (input.tool_input && input.tool_input.command) || "";
    // Extract first line only — heredoc/python content is not the primary command
    var firstLine = cmd.split("\n")[0];

    // Block git remote set-url / add / remove (only as the primary command)
    if (/^\s*(cd\s+[^;]+;\s*)?git\s+remote\s+(set-url|add|remove|rename)\b/.test(firstLine)) {
      return {
        decision: "block",
        reason: "[publish-json-guard] Changing git remotes can redirect pushes to the wrong org.\n" +
          "If this change is intentional, the user must run the command manually."
      };
    }

    // Block direct shell writes to publish.json (only as the primary command)
    // Allow creation commands (cat >, echo >) when file doesn't exist
    if (/^\s*(sed|tee|cp|mv)\b.*publish\.json/.test(firstLine) ||
        />\s*\S*publish\.json/.test(firstLine)) {
      // Extract target path from redirect (e.g. "> .github/publish.json" or "> /abs/path/.github/publish.json")
      var redirectMatch = firstLine.match(/>\s*(\S*publish\.json)/);
      var shellTarget = redirectMatch ? redirectMatch[1] : null;
      // Also check cd prefix to resolve relative paths
      var cdMatch = firstLine.match(/^\s*cd\s+["']?([^"';&]+?)["']?\s*[;&]/);
      if (shellTarget && cdMatch && !require("path").isAbsolute(shellTarget)) {
        shellTarget = require("path").join(cdMatch[1], shellTarget);
      }
      if (shellTarget && !fs.existsSync(shellTarget)) {
        return null; // Allow creation
      }
      return {
        decision: "block",
        reason: "[publish-json-guard] Modifying publish.json via shell can break GitHub account routing.\n" +
          "If this change is intentional, the user must edit the file manually."
      };
    }

    // Block git config changes to remote URLs (only as the primary command)
    if (/^\s*(cd\s+[^;]+;\s*)?git\s+config\b.*\bremote\./.test(firstLine)) {
      return {
        decision: "block",
        reason: "[publish-json-guard] Changing git remote config can redirect pushes to the wrong org.\n" +
          "If this change is intentional, the user must run the command manually."
      };
    }
  }

  return null;
};
