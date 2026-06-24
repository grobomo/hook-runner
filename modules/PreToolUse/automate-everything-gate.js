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
        reason: "BLOCKED: Manual lint/check commands (flake8, pylint, shellcheck, etc.)\nWHY: These commands should run automatically in CI/CD pipelines, not be executed manually during development, to ensure consistent code quality standards across all commits.\nNEXT STEPS:\n1. Remove the manual command and rely on pre-commit hooks or CI pipeline checks instead\n2. Review the project's linting configuration to ensure all checks run automatically on push\nFALSE POSITIVE? File a TODO in hook-runner: \"Fix automate-everything-gate — {describe the issue}\""
      };
    }
  }

  return null;
};
