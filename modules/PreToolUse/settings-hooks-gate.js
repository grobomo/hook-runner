// WORKFLOW: shtd
// WHY: Claude added hooks directly to settings.json instead of using the
// hook-runner module system (run-modules/{Event}/*.js). Direct settings.json
// hook entries bypass the modular architecture and create one-off hooks that
// can't be independently managed, archived, or reasoned about.
//
// The hook-runner pattern: ONE runner per event in settings.json, modules in
// run-modules/{Event}/. To add behavior, create a module — never edit the
// hooks section of settings.json.
//
// Incident: 2026-04-04 — Claude added chat-export and terminal-title hooks
// directly to settings.json Stop and SessionStart arrays instead of creating
// run-modules/Stop/ and run-modules/SessionStart/ modules.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Edit") return null;

  var filePath = ((input.tool_input || {}).file_path || "").replace(/\\/g, "/");

  // Only gate ~/.claude/settings.json and ~/.claude/settings.local.json
  if (!/\/\.claude\/settings(\.local)?\.json$/.test(filePath)) return null;

  // Check if the edit touches the hooks section
  var oldStr = (input.tool_input || {}).old_string || "";
  var newStr = (input.tool_input || {}).new_string || "";

  // Detect hook additions: new_string is longer and contains hook-like patterns
  var hookPatterns = [
    /"type"\s*:\s*"command"/,
    /"command"\s*:/,
    /"hooks"\s*:\s*\[/,
    /"matcher"\s*:/,
    /"type"\s*:\s*"prompt"/,
    /"type"\s*:\s*"agent"/
  ];

  // Only block if new content adds hook entries (not if removing/simplifying)
  var addsHooks = false;
  for (var i = 0; i < hookPatterns.length; i++) {
    if (hookPatterns[i].test(newStr) && !hookPatterns[i].test(oldStr)) {
      addsHooks = true;
      break;
    }
  }

  if (!addsHooks) return null;

  return {
    decision: "block",
    reason: "BLOCKED: Do not add hooks directly to settings.json. " +
      "Use the hook-runner module system instead:\n\n" +
      "  1. Create a module: ~/.claude/hooks/run-modules/{Event}/your-module.js\n" +
      "  2. The runner (run-{event}.js) loads all modules automatically\n" +
      "  3. For Stop hooks: ~/.claude/hooks/run-modules/Stop/\n" +
      "  4. For SessionStart hooks: ~/.claude/hooks/run-modules/SessionStart/\n\n" +
      "settings.json should only have ONE runner entry per event. " +
      "All behavior goes in modules.\n\n" +
      "See ~/.claude/rules/archive/hook-architecture.md for the full pattern."
  };
};
