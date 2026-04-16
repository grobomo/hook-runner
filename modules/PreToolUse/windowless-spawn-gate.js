// WORKFLOW: shtd, starter
// WHY: Hook modules using execSync("git ...") spawn cmd.exe on Windows,
// creating visible console popups that steal focus. Every tool call fires
// 2-5 hooks, each potentially spawning multiple cmd.exe windows. Fix:
// require execFileSync (no shell) or windowsHide:true on all child_process
// calls in hook module code. This gate blocks writes of modules that violate.
"use strict";
var path = require("path");

// Patterns that spawn visible processes on Windows
var DANGEROUS_PATTERNS = [
  // execSync with string command (uses cmd.exe shell)
  /\bexecSync\s*\(\s*["'`]/,
  // spawnSync with shell:true but no windowsHide
  /\bspawnSync\s*\([^)]*shell\s*:\s*true/,
  // spawn with shell:true but no windowsHide
  /\bspawn\s*\([^)]*shell\s*:\s*true/
];

// Safe alternatives that don't need checking
var SAFE_PATTERNS = [
  /windowsHide\s*:\s*true/,
  /\bexecFileSync\b/
];

module.exports = function(input) {
  var tool = input.tool_name || "";
  if (tool !== "Write" && tool !== "Edit") return null;
  if (process.env.HOOK_RUNNER_TEST === "1") return null;

  var ti = input.tool_input || {};
  var filePath = (ti.file_path || "").replace(/\\/g, "/");

  // Only check hook module files
  if (filePath.indexOf("/run-modules/") < 0 &&
      filePath.indexOf("/modules/") < 0 &&
      filePath.indexOf("/hooks/run-") < 0) return null;
  if (filePath.slice(-3) !== ".js") return null;

  // Get the content being written
  var content = "";
  if (tool === "Write") {
    content = ti.content || "";
  } else if (tool === "Edit") {
    content = ti.new_string || "";
  }
  if (!content) return null;

  // Check each line for dangerous patterns
  var violations = [];
  var lines = content.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Skip comments
    if (line.trim().indexOf("//") === 0) continue;

    for (var p = 0; p < DANGEROUS_PATTERNS.length; p++) {
      if (!DANGEROUS_PATTERNS[p].test(line)) continue;

      // Check if the surrounding context (next few lines) has a safe pattern
      var context = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      var isSafe = false;
      for (var s = 0; s < SAFE_PATTERNS.length; s++) {
        if (SAFE_PATTERNS[s].test(context)) {
          isSafe = true;
          break;
        }
      }

      if (!isSafe) {
        violations.push("Line " + (i + 1) + ": " + line.trim().slice(0, 80));
      }
    }
  }

  if (violations.length === 0) return null;

  return {
    decision: "block",
    reason: "WINDOWLESS SPAWN GATE: " + violations.length + " process spawn(s) will create visible CMD popups on Windows.\n" +
      "WHY: execSync(\"string\") uses cmd.exe as shell → visible console window steals focus.\n\n" +
      "VIOLATIONS:\n  " + violations.join("\n  ") + "\n\n" +
      "FIX: Use one of these patterns instead:\n" +
      "  cp.execFileSync(\"git\", [\"status\", \"--porcelain\"], {windowsHide: true})  // best: no shell\n" +
      "  cp.execSync(\"complex | command\", {windowsHide: true})  // OK if shell features needed\n" +
      "  cp.spawnSync(\"git\", [...], {windowsHide: true})  // OK: explicit windowsHide"
  };
};
