// TOOLS: Edit, Write, Bash
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Claude added hooks directly to settings.json instead of using the
// hook-runner module system. Direct edits bypass backup, validation, and
// rollback — a corrupt settings.json crashes Claude entirely.
// T762: All settings.json hook changes must go through the watchdog's
// install/uninstall commands which backup, validate, and auto-rollback.
//
// Incident: 2026-04-04 — Claude added chat-export hooks directly to settings.json
// Incident: 2026-05-30 — User directed: settings.json must only be modified via
//   approved scripts with backup + validation + auto-rollback.
"use strict";

var path = require("path");
var bashHelper = require(path.join(__dirname, "_bash-write-patterns.js"));

module.exports = function(input) {
  var tool = input.tool_name;
  var ti = input.tool_input || {};

  // Determine if this targets settings.json
  var filePath = "";
  if (tool === "Edit" || tool === "Write") {
    filePath = (ti.file_path || "").replace(/\\/g, "/");
  } else if (tool === "Bash") {
    var cmd = ti.command || "";
    // Check if Bash command writes to settings.json
    var parsed = bashHelper.parseBashWrite(cmd);
    if (parsed) filePath = (parsed.targetPath || "").replace(/\\/g, "/");
    // Also catch direct node/python scripts that modify settings
    // Note: cat without redirection is read-only, so exclude plain cat
    if (/settings\.json/.test(cmd) && (/write|echo|tee|sed|printf/.test(cmd) || /cat\s.*>/.test(cmd))) {
      filePath = "settings.json";
    }
  }
  if (!filePath) return null;

  // Only gate ~/.claude/settings.json and ~/.claude/settings.local.json
  if (!/\/\.claude\/settings(\.local)?\.json$/.test(filePath) &&
      filePath !== "settings.json") return null;

  // For Edit: check if the edit touches hooks section
  if (tool === "Edit") {
    var oldStr = ti.old_string || "";
    var newStr = ti.new_string || "";
    var hookPatterns = [
      /"type"\s*:\s*"(command|prompt|agent)"/,
      /"command"\s*:/,
      /"hooks"\s*:\s*\[/,
      /"matcher"\s*:/,
    ];
    var addsHooks = false;
    for (var i = 0; i < hookPatterns.length; i++) {
      if (hookPatterns[i].test(newStr) && !hookPatterns[i].test(oldStr)) {
        addsHooks = true;
        break;
      }
    }
    if (!addsHooks) return null;
  }

  // For Write: always block full rewrites of settings.json
  // For Bash: always block if targeting settings.json

  return {
    decision: "block",
    reason: "BLOCKED: Direct modification of settings.json hook entries.\n" +
      "WHY: A corrupt settings.json crashes Claude entirely — all changes must go through scripts with backup + validation + auto-rollback.\n" +
      "NEXT STEPS:\n" +
      "1. To add/remove hooks: node ~/.claude/hooks/hook-runner-watchdog.js install|uninstall\n" +
      "2. To add behavior: create a module in ~/.claude/hooks/run-modules/{Event}/\n" +
      "3. For non-hook settings (env vars, permissions): use the /update-config skill\n" +
      "FALSE POSITIVE? File a TODO in hook-runner: \"Fix settings-hooks-gate — {describe the issue}\""
  };
};
