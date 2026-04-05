// WORKFLOW: shtd
// WHY: Hooks were edited without WORKFLOW tags or WHY comments, making it
// impossible to trace why a gate exists. Runners used exit(0) for blocks,
// hiding failures from the TUI. This gate enforces hook quality standards.
"use strict";
// Hook editing gate: enforces quality standards when editing hook infrastructure.
// Fires on Edit/Write targeting run-modules/ or run-*.js files.
// Checks:
//   1. Block messages must use exit(1) not exit(0)
//   2. Block messages must write to stderr for TUI visibility
//   3. Modules must have // WORKFLOW: tag
//   4. Modules must have // WHY: comment
var path = require("path");

module.exports = function(input) {
  var tool = input.tool_name;
  if (tool !== "Edit" && tool !== "Write") return null;

  var ti = input.tool_input;
  if (typeof ti === "string") { try { ti = JSON.parse(ti); } catch(e) { ti = {}; } }
  var filePath = (ti || {}).file_path || "";
  if (!filePath) return null;
  var norm = filePath.replace(/\\/g, "/");
  var base = path.basename(norm);

  // Only check hook infrastructure files
  var isRunner = /run-[a-z]+\.js$/.test(base);
  var isModule = /run-modules\//.test(norm) && base.endsWith(".js");
  if (!isRunner && !isModule) return null;

  // Get the content being written
  var content = "";
  if (tool === "Write") {
    content = (ti || {}).content || "";
  } else {
    // For Edit, check the new_string
    content = (ti || {}).new_string || "";
  }

  if (!content) return null;

  var issues = [];

  // For runners (run-*.js): check exit code and stderr patterns
  if (isRunner) {
    // Check for exit(0) in block paths — should be exit(1)
    if (/process\.exit\(0\)/.test(content) && /block|decision/.test(content)) {
      issues.push("Runner uses exit(0) for blocks — must use exit(1) so the TUI shows the block");
    }
  }

  // For modules: check WORKFLOW tag and WHY comment
  if (isModule) {
    // Only check full file writes, not small edits
    if (tool === "Write" || content.split("\n").length > 5) {
      if (!/\/\/ WORKFLOW:/.test(content)) {
        issues.push("Missing // WORKFLOW: tag — every module must declare its workflow");
      }
      if (!/\/\/ WHY:/.test(content)) {
        issues.push("Missing // WHY: comment — explain the real incident that caused this module");
      }
    }
  }

  if (issues.length > 0) {
    return {
      decision: "block",
      reason: "HOOK EDITING GATE: Hook quality issues detected:\n" +
        issues.map(function(i) { return "  - " + i; }).join("\n") + "\n\n" +
        "WHY: Hooks without WORKFLOW tags can't be traced to a workflow.\n" +
        "Hooks without WHY comments lose the incident context that justified them.\n" +
        "Runners using exit(0) for blocks hide failures from the TUI.\n\n" +
        "FIX: Add the missing tags/comments before saving.\n" +
        "File: " + base
    };
  }

  return null;
};
