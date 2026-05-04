#!/usr/bin/env bash
set -euo pipefail

echo "=== hook-runner: automate-everything-gate (T605) ==="
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOD_POSIX="$(cd "$SCRIPT_DIR/../.." && pwd)/modules/PreToolUse/automate-everything-gate.js"
MOD="$(cygpath -m "$MOD_POSIX" 2>/dev/null || echo "$MOD_POSIX")"

run_gate() {
  local tool="$1"
  local cmd="$2"
  node -e "
    var mod = require('$MOD');
    var result = mod({ tool_name: '$tool', tool_input: { command: $(node -e "process.stdout.write(JSON.stringify('$cmd'))") } });
    process.stdout.write(result ? JSON.stringify(result) : 'null');
  " 2>/dev/null
}

# === Blocked: standalone lint commands ===
for cmd in "flake8 src/" "pylint app.py" "mypy src/" "ruff check ." "shellcheck script.sh" "semgrep --config auto" "eslint src/"; do
  OUTPUT=$(run_gate "Bash" "$cmd")
  if echo "$OUTPUT" | grep -q "AUTOMATE-EVERYTHING"; then
    pass "blocks: $cmd"
  else
    fail "should block: $cmd — got: $OUTPUT"
  fi
done

# === Blocked: python -m variants ===
for cmd in "python -m py_compile app.py" "python -m flake8 src/" "python -m pylint app.py" "python -m mypy src/"; do
  OUTPUT=$(run_gate "Bash" "$cmd")
  if echo "$OUTPUT" | grep -q "AUTOMATE-EVERYTHING"; then
    pass "blocks: $cmd"
  else
    fail "should block: $cmd — got: $OUTPUT"
  fi
done

# === Blocked: check-only mode ===
for cmd in "black --check src/" "isort --check src/" "prettier --check src/"; do
  OUTPUT=$(run_gate "Bash" "$cmd")
  if echo "$OUTPUT" | grep -q "AUTOMATE-EVERYTHING"; then
    pass "blocks: $cmd"
  else
    fail "should block: $cmd — got: $OUTPUT"
  fi
done

# === Blocked: PowerShell linting ===
OUTPUT=$(run_gate "Bash" "Invoke-ScriptAnalyzer -Path test.ps1")
if echo "$OUTPUT" | grep -q "AUTOMATE-EVERYTHING"; then
  pass "blocks: Invoke-ScriptAnalyzer"
else
  fail "should block: Invoke-ScriptAnalyzer — got: $OUTPUT"
fi

OUTPUT=$(run_gate "Bash" "powershell -c Invoke-ScriptAnalyzer -Path test.ps1")
if echo "$OUTPUT" | grep -q "AUTOMATE-EVERYTHING"; then
  pass "blocks: powershell Invoke-ScriptAnalyzer"
else
  fail "should block: powershell Invoke-ScriptAnalyzer — got: $OUTPUT"
fi

# === Allowed: script wrappers ===
for cmd in "scripts/test/lint.sh" "bash scripts/lint.sh" "./scripts/check.sh"; do
  OUTPUT=$(run_gate "Bash" "$cmd")
  if [ "$OUTPUT" = "null" ]; then
    pass "allows: $cmd"
  else
    fail "should allow: $cmd — got: $OUTPUT"
  fi
done

# === Allowed: non-lint commands ===
for cmd in "git status" "npm test" "node app.js" "python app.py" "ls -la"; do
  OUTPUT=$(run_gate "Bash" "$cmd")
  if [ "$OUTPUT" = "null" ]; then
    pass "allows: $cmd"
  else
    fail "should allow: $cmd — got: $OUTPUT"
  fi
done

# === Allowed: piped input ===
OUTPUT=$(run_gate "Bash" "cat file.sh | shellcheck -")
if [ "$OUTPUT" = "null" ]; then
  pass "allows: piped shellcheck"
else
  fail "should allow piped shellcheck — got: $OUTPUT"
fi

# === Allowed: non-Bash tools ===
OUTPUT=$(run_gate "Read" "flake8 src/")
if [ "$OUTPUT" = "null" ]; then
  pass "allows: Read tool (not Bash)"
else
  fail "should allow Read tool — got: $OUTPUT"
fi

# === Block message quality ===
OUTPUT=$(run_gate "Bash" "flake8 src/")
if echo "$OUTPUT" | grep -q "CI/CD" && echo "$OUTPUT" | grep -q "pipeline"; then
  pass "block message mentions CI/CD pipeline"
else
  fail "block message should mention CI/CD pipeline"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS + FAIL))"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
