// TOOLS: Bash
// WORKFLOW: shtd, gsd
// WHY: Claude runs manual lint/check commands (flake8, pylint, shellcheck,
// semgrep, py_compile) ad-hoc in the terminal. These checks die with the
// session — next session makes the same mistakes. User corrected this 20+
// times: "add it to CI, don't just run it manually". This gate forces checks
// into build pipelines (scripts/, CI config, pre-commit hooks).
// T605: Block manual lint/check commands, force pipeline integration.
"use strict";

module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;

  var cmd = (input.tool_input || {}).command || "";
  var normalized = cmd.replace(/\s+/g, " ").trim();

  // Allow if running from a script
  if (/^\s*(bash\s+)?scripts\//.test(normalized)) return null;
  if (/^\s*(bash\s+)?\.\/scripts\//.test(normalized)) return null;
  if (/^\s*(bash\s+)?\S+\.sh\b/.test(normalized)) return null;
  // Allow piped commands where the lint tool is not the entry point
  // e.g. "cat file | shellcheck -" or "echo test | python -c"
  if (/^\s*(cat|echo|printf)\s/.test(normalized)) return null;

  // Lint/check tool patterns — standalone invocations only
  var lintPatterns = [
    /^\s*flake8\b/,
    /^\s*pylint\b/,
    /^\s*mypy\b/,
    /^\s*ruff\s+(check|format)\b/,
    /^\s*black\s+--check\b/,
    /^\s*isort\s+--check\b/,
    /^\s*shellcheck\b/,
    /^\s*semgrep\b/,
    /^\s*py_compile\b/,
    /^\s*python\s+.*-m\s+py_compile\b/,
    /^\s*python\s+.*-m\s+flake8\b/,
    /^\s*python\s+.*-m\s+pylint\b/,
    /^\s*python\s+.*-m\s+mypy\b/,
    /^\s*eslint\b/,
    /^\s*prettier\s+--check\b/,
    /^\s*Invoke-ScriptAnalyzer\b/i,
    /^\s*powershell.*Invoke-ScriptAnalyzer\b/i,
    /^\s*pwsh.*Invoke-ScriptAnalyzer\b/i,
  ];

  for (var i = 0; i < lintPatterns.length; i++) {
    if (lintPatterns[i].test(normalized)) {
      var toolName = normalized.split(/\s/)[0];
      return {
        decision: "block",
        reason: "AUTOMATE-EVERYTHING: Manual lint/check command detected: " + toolName + "\n" +
          "WHY: Ad-hoc checks die with the session. The next session repeats the same mistakes.\n\n" +
          "FIX: Add the check to a persistent pipeline:\n" +
          "  1. CI/CD: Add to .github/workflows/ (runs on every push/PR)\n" +
          "  2. Pre-commit: Add to .pre-commit-config.yaml\n" +
          "  3. Build script: Add to scripts/test/ or Makefile\n\n" +
          "Then run it VIA the pipeline, not standalone.\n" +
          "Command was: " + cmd.substring(0, 120)
      };
    }
  }

  return null;
};
