// TOOLS: Edit, Write
// WORKFLOW: shtd, starter, haiku-rules
// WHY: Hook modules using execSync("git ...") or subprocess.Popen(shell=True)
// spawn cmd.exe on Windows, creating visible console popups that steal focus.
// Every tool call fires 2-5 hooks, each potentially spawning multiple windows.
// Fix: require windowsHide:true (JS) or CREATE_NO_WINDOW (Python) on all
// child_process/subprocess calls. This gate blocks writes that violate.
"use strict";

// --- JS patterns (child_process) ---
var JS_DANGEROUS = [
  // execSync with string command (uses cmd.exe shell)
  /\bexecSync\s*\(\s*["'`]/,
  // spawnSync with shell:true but no windowsHide
  /\bspawnSync\s*\([^)]*shell\s*:\s*true/,
  // spawn with shell:true but no windowsHide
  /\bspawn\s*\([^)]*shell\s*:\s*true/
];

var JS_SAFE = [
  /windowsHide\s*:\s*true/,
  /\bexecFileSync\b/
];

// --- Python patterns (subprocess) ---
var PY_DANGEROUS = [
  // subprocess.Popen(..., shell=True)
  /\bsubprocess\.Popen\s*\([^)]*shell\s*=\s*True/,
  // subprocess.call(..., shell=True)
  /\bsubprocess\.call\s*\([^)]*shell\s*=\s*True/,
  // subprocess.run(..., shell=True)
  /\bsubprocess\.run\s*\([^)]*shell\s*=\s*True/,
  // subprocess.check_call(..., shell=True)
  /\bsubprocess\.check_call\s*\([^)]*shell\s*=\s*True/,
  // subprocess.check_output(..., shell=True)
  /\bsubprocess\.check_output\s*\([^)]*shell\s*=\s*True/,
  // os.system("command") — always uses shell
  /\bos\.system\s*\(/,
  // os.popen("command") — always uses shell
  /\bos\.popen\s*\(/
];

var PY_SAFE = [
  /CREATE_NO_WINDOW/,
  /creationflags/,
  /startupinfo/
];

var JS_FIX =
  "FIX (JS): Use one of these patterns instead:\n" +
  "  cp.execFileSync(\"git\", [\"status\", \"--porcelain\"], {windowsHide: true})  // best: no shell\n" +
  "  cp.execSync(\"complex | command\", {windowsHide: true})  // OK if shell features needed\n" +
  "  cp.spawnSync(\"git\", [...], {windowsHide: true})  // OK: explicit windowsHide";

var PY_FIX =
  "FIX (Python): Use one of these patterns instead:\n" +
  "  subprocess.run([\"git\", \"status\"], creationflags=subprocess.CREATE_NO_WINDOW)  // best\n" +
  "  si = subprocess.STARTUPINFO(); si.dwFlags |= subprocess.STARTF_USESHOWWINDOW\n" +
  "  subprocess.Popen(cmd, shell=True, startupinfo=si)  // OK if shell features needed\n" +
  "  subprocess.run(cmd, shell=True, creationflags=0x08000000)  // OK: CREATE_NO_WINDOW flag";

function isComment(line, lang) {
  var trimmed = line.trim();
  if (lang === "py") return trimmed.indexOf("#") === 0;
  return trimmed.indexOf("//") === 0;
}

module.exports = function(input) {
  var tool = input.tool_name || "";
  if (tool !== "Write" && tool !== "Edit") return null;
  if (process.env.HOOK_RUNNER_TEST === "1") return null;

  var ti = input.tool_input || {};
  var filePath = (ti.file_path || "").replace(/\\/g, "/");

  // Only check hook module files and scripts in hook directories
  if (filePath.indexOf("/run-modules/") < 0 &&
      filePath.indexOf("/modules/") < 0 &&
      filePath.indexOf("/hooks/run-") < 0 &&
      filePath.indexOf("/hooks/") < 0) return null;

  // Determine language from extension
  var lang;
  if (filePath.slice(-3) === ".js") lang = "js";
  else if (filePath.slice(-3) === ".py") lang = "py";
  else return null;

  var dangerous = lang === "js" ? JS_DANGEROUS : PY_DANGEROUS;
  var safe = lang === "js" ? JS_SAFE : PY_SAFE;

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
    if (isComment(line, lang)) continue;

    for (var p = 0; p < dangerous.length; p++) {
      if (!dangerous[p].test(line)) continue;

      // Check if the surrounding context (next few lines) has a safe pattern
      var context = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      var isSafe = false;
      for (var s = 0; s < safe.length; s++) {
        if (safe[s].test(context)) {
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

  var why = lang === "js"
    ? "WHY: execSync(\"string\") uses cmd.exe as shell — visible console window steals focus every tool call (2-5 hooks fire per call)."
    : "WHY: subprocess with shell=True / os.system() spawns cmd.exe — visible console window steals focus every tool call.";

  return {
    decision: "block",
    reason: "BLOCKED: Execution of shell commands through subprocess or git operations with shell=True\nWHY: Previous incidents showed that shell=True and execSync with git commands created injection vulnerabilities and uncontrolled process spawning\nNEXT STEPS:\n1. Use subprocess.run() with shell=False and pass arguments as a list instead\n2. Replace execSync with explicit module imports or use subprocess without shell interpretation\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix windowless-spawn-gate — {describe the issue}\""
  };
};
