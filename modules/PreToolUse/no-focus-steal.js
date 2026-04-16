// TOOLS: Bash
// WORKFLOW: shtd, starter
// WHY: Background claude -p self-analysis opened a visible terminal tab that
// stole focus from the user's work. On Windows, child_process.spawn with
// detached+windowsHide still flashes a console.
//
// SCOPE: Only blocks background PROCESS launches (nohup, &, detached scripts).
// Does NOT block opening files (start "" "file.pdf") — that's user-requested
// and SHOULD take focus. Cross-platform: only fires on win32 since macOS/Linux
// don't have the console-flash problem.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  if (process.platform !== "win32") return null;

  var cmd = (input.tool_input || {}).command || "";

  // Allow: opening files with `start` — user wants these visible.
  // Pattern: start "" "path/to/file.ext" or start "" file.ext
  // File extensions that are documents/media, not executables:
  var fileOpenPattern = /\bstart\s+(""|'')\s+["']?[^"']*\.(pdf|html?|png|jpe?g|gif|txt|md|csv|xlsx?|docx?|pptx?)\b/i;
  if (fileOpenPattern.test(cmd)) return null;

  // Detect background process patterns that flash console windows
  var hasTrailingAmpersand = /[^&]&\s*$/.test(cmd) || /^&\s*$/.test(cmd);
  var hasNohup = /\bnohup\b/.test(cmd);
  // start launching an executable (not a file) — e.g. start "" cmd, start python
  var hasStartExe = /\bstart\s+(""|'')\s+["']?\w+\.(exe|bat|cmd|ps1)\b/i.test(cmd) ||
                    /\bstart\s+(""|'')\s+(cmd|powershell|python|node|bash|claude)\b/i.test(cmd);

  if (!hasTrailingAmpersand && !hasNohup && !hasStartExe) return null;

  // Block: background process that will steal focus
  var spawnsProcess = /\b(node|python|bash|claude|powershell)\b/.test(cmd);
  if (!spawnsProcess && !hasStartExe) return null;

  return {
    decision: "block",
    reason: "FOCUS STEAL: This spawns a background process that flashes a " +
      "console window on Windows. Use run_in_background parameter instead, " +
      "or for long-running daemons use a scheduled task with hidden window.\n" +
      "If opening a file, use: start \"\" \"path/to/file.ext\""
  };
};
