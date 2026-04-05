#!/usr/bin/env bash
# WHY: T125 — verify watchdog scheduler install/uninstall/status work
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== hook-runner: watchdog scheduler ==="
PASS=0; FAIL=0

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"; FAIL=$((FAIL+1))
  fi
}

# Setup: isolated temp hooks dir with required files
TMPDIR="$(pwd -W 2>/dev/null || pwd)/.test-tmp-T125-$$"
mkdir -p "$TMPDIR/run-modules/Stop" "$TMPDIR/run-modules/PreToolUse"
trap 'rm -rf "$TMPDIR"' EXIT
for r in run-pretooluse.js run-posttooluse.js run-stop.js run-sessionstart.js run-userpromptsubmit.js load-modules.js workflow.js; do
  echo "// stub" > "$TMPDIR/$r"
done
echo 'module.exports = function() { return null; };' > "$TMPDIR/run-modules/Stop/auto-continue.js"
echo 'module.exports = function() { return null; };' > "$TMPDIR/run-modules/PreToolUse/branch-pr-gate.js"
echo '{"shtd": true}' > "$TMPDIR/workflow-config.json"

# Test 1: --install creates scheduled task (Windows) or cron entry (Linux)
EC_INSTALL=0
OUT_INSTALL=$(node watchdog.js --install --hooks-dir "$TMPDIR" 2>&1) || EC_INSTALL=$?
assert "install exits 0" "0" "$EC_INSTALL"
if echo "$OUT_INSTALL" | grep -qi "installed"; then
  assert "install output confirms registration" "0" "0"
else
  assert "install output confirms registration" "0" "1"
fi

# Test 1b: VBS wrapper created on Windows (check before uninstall deletes it)
if [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]] || [[ "$OSTYPE" == "msys" ]]; then
  if [ -f "$TMPDIR/watchdog-hidden.vbs" ]; then
    assert "VBS wrapper created (Windows)" "0" "0"
  else
    assert "VBS wrapper created (Windows)" "0" "1"
  fi
fi

# Test 2: --status shows registered
EC_STATUS=0
OUT_STATUS=$(node watchdog.js --status --hooks-dir "$TMPDIR" 2>&1) || EC_STATUS=$?
assert "status exits 0 (registered)" "0" "$EC_STATUS"
if echo "$OUT_STATUS" | grep -qi "registered"; then
  assert "status shows registered" "0" "0"
else
  assert "status shows registered" "0" "1"
fi

# Test 3: --uninstall removes task
EC_UNINST=0
OUT_UNINST=$(node watchdog.js --uninstall --hooks-dir "$TMPDIR" 2>&1) || EC_UNINST=$?
assert "uninstall exits 0" "0" "$EC_UNINST"
if echo "$OUT_UNINST" | grep -qi "removed"; then
  assert "uninstall confirms removal" "0" "0"
else
  assert "uninstall confirms removal" "0" "1"
fi

# Test 4: --status after uninstall shows not registered
EC_STATUS2=0
OUT_STATUS2=$(node watchdog.js --status --hooks-dir "$TMPDIR" 2>&1) || EC_STATUS2=$?
assert "status exits 1 (not registered)" "1" "$EC_STATUS2"
if echo "$OUT_STATUS2" | grep -qi "not registered"; then
  assert "status shows not registered" "0" "0"
else
  assert "status shows not registered" "0" "1"
fi

# Test 5: --log works (may have entries from previous runs)
EC_LOG=0
OUT_LOG=$(node watchdog.js --log --hooks-dir "$TMPDIR" 2>&1) || EC_LOG=$?
assert "log command exits 0" "0" "$EC_LOG"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
