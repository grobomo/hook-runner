// WORKFLOW: shtd, starter
// WHY: _tmemu/openclaw is the live production OpenClaw instance. Hook porting
// work must happen on a separate _grobomo/openclaw test instance in WSL.
// This gate blocks any edits to hook-related files in _tmemu/openclaw to
// prevent accidental modification of the production hook system.
"use strict";

module.exports = function(input) {
  var tool = input.tool_name;

  // Only check tools that modify files
  if (tool !== "Edit" && tool !== "Write" && tool !== "Bash") return null;

  // Pattern: _tmemu/openclaw paths containing hooks
  var tmemu = "_tmemu/openclaw";
  var hookDirs = ["/hooks/", "/.openclaw/hooks/", "/run-modules/"];

  if (tool === "Edit" || tool === "Write") {
    var filePath = (input.tool_input && (input.tool_input.file_path || "")) || "";
    filePath = filePath.replace(/\\/g, "/");

    if (filePath.indexOf(tmemu) !== -1) {
      for (var i = 0; i < hookDirs.length; i++) {
        if (filePath.indexOf(hookDirs[i]) !== -1) {
          return {
            decision: "block",
            reason: "[openclaw-tmemu-guard] _tmemu/openclaw is the production instance.\n" +
              "Hook modifications must happen on the _grobomo/openclaw test instance.\n" +
              "Create/test hooks there first, then manually deploy to production."
          };
        }
      }
    }
  }

  if (tool === "Bash") {
    var cmd = (input.tool_input && input.tool_input.command) || "";
    var firstLine = cmd.split("\n")[0];

    // Block WSL commands that write to openclaw hooks in the tmemu instance
    if (/wsl.*openclaw.*hook/i.test(firstLine) &&
        /\b(write|edit|cp|mv|sed|tee|rm|mkdir)\b/.test(firstLine)) {
      return {
        decision: "block",
        reason: "[openclaw-tmemu-guard] Don't modify hooks on the production OpenClaw instance via WSL.\n" +
          "Use the _grobomo/openclaw test instance instead."
      };
    }
  }

  return null;
};
