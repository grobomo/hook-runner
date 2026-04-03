// WHY: Background claude -p self-analysis opened a visible terminal tab that
// stole focus from the user's work. On Windows, child_process.spawn with
// detached+windowsHide still flashes a console. Must use VBS wrapper.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";

  // Detect background process spawning patterns that will steal focus on Windows
  // Only check commands that spawn detached/background processes
  // Note: & (background) vs && (chaining) — only match trailing & not &&
  var hasBackground = /[^&]&\s*$/.test(cmd) || /^&\s*$/.test(cmd);
  if (cmd.indexOf("run_in_background") === -1 &&
      !hasBackground &&
      cmd.indexOf("nohup") === -1 &&
      cmd.indexOf("start ") === -1) return null;

  // If spawning node/python/bash in background on Windows, warn about focus steal
  if (process.platform !== "win32") return null;

  var spawnsProcess = /\b(node|python|bash|claude)\b.*&\s*$/.test(cmd) ||
                      /\bstart\s+/.test(cmd) ||
                      /\bnohup\b/.test(cmd);

  if (!spawnsProcess) return null;

  return {
    decision: "block",
    reason: "FOCUS STEAL WARNING: Background processes on Windows open visible " +
      "console windows. Use a VBS wrapper to hide them:\n\n" +
      "  var vbs = path.join(os.tmpdir(), 'hidden-task.vbs');\n" +
      "  fs.writeFileSync(vbs,\n" +
      "    'Set ws = CreateObject(\"WScript.Shell\")\\n' +\n" +
      "    'ws.Run \"cmd /c <your command>\", 0, False\\n');\n" +
      "  cp.spawn('wscript.exe', [vbs], {detached:true, stdio:'ignore'}).unref();\n\n" +
      "See also: ~/.claude/rules/windows-hidden-scheduled-tasks.md\n" +
      "Rule: NEVER spawn background processes that steal user focus."
  };
};
