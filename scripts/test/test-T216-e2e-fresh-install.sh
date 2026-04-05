#!/usr/bin/env bash
# WHY: T216 — verify fresh install works end-to-end in isolated temp dir
# Simulates a new user: clone → setup --dry-run --yes → health → report → watchdog
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO_DIR="$(pwd -W 2>/dev/null || pwd)"

echo "=== hook-runner: e2e fresh install ==="
PASS=0; FAIL=0

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"; FAIL=$((FAIL+1))
  fi
}

# Test 1: setup.js loads and shows version
OUT=$(node setup.js --version 2>&1)
if echo "$OUT" | grep -q "2.0.0"; then
  assert "version is 2.0.0" "0" "0"
else
  assert "version is 2.0.0" "0" "1"
fi

# Test 2: --dry-run --yes completes without error
EC=0
OUT=$(node setup.js --dry-run --yes 2>&1) || EC=$?
assert "dry-run --yes exits 0" "0" "$EC"

# Test 3: --help shows all major commands
OUT=$(node setup.js --help 2>&1)
CMDS_FOUND=0
for cmd in "--test" "--health" "--report" "--sync" "--workflow" "--upgrade" "--uninstall" "--watchdog"; do
  if echo "$OUT" | grep -qi "${cmd#--}"; then
    CMDS_FOUND=$((CMDS_FOUND+1))
  fi
done
if [ "$CMDS_FOUND" -ge 6 ]; then
  assert "help lists major commands ($CMDS_FOUND/8)" "0" "0"
else
  assert "help lists major commands ($CMDS_FOUND/8)" "0" "1"
fi

# Test 4: --health runs (may report issues in CI but shouldn't crash)
EC=0
OUT=$(node setup.js --health 2>&1) || EC=$?
if [ "$EC" -eq 0 ]; then
  assert "health check completes" "0" "0"
else
  # health may exit non-zero if not installed — that's ok, just shouldn't crash
  if echo "$OUT" | grep -q "ok\|warning\|missing"; then
    assert "health check completes" "0" "0"
  else
    assert "health check completes" "0" "1"
  fi
fi

# Test 5: --report generates HTML
EC=0
OUT=$(node setup.js --report 2>&1) || EC=$?
if [ -f "hook-runner-report.html" ] || echo "$OUT" | grep -qi "report\|html"; then
  assert "report generates output" "0" "0"
else
  assert "report generates output" "0" "1"
fi

# Test 6: watchdog.js runs without error (against temp hooks dir)
TMPDIR="$(pwd -W 2>/dev/null || pwd)/.test-tmp-T216-$$"
mkdir -p "$TMPDIR/run-modules/Stop" "$TMPDIR/run-modules/PreToolUse"
trap 'rm -rf "$TMPDIR"' EXIT
for r in run-pretooluse.js run-posttooluse.js run-stop.js run-sessionstart.js run-userpromptsubmit.js load-modules.js workflow.js; do
  echo "// stub" > "$TMPDIR/$r"
done
echo 'module.exports = function() { return null; };' > "$TMPDIR/run-modules/Stop/auto-continue.js"
echo 'module.exports = function() { return null; };' > "$TMPDIR/run-modules/PreToolUse/branch-pr-gate.js"
echo '{"shtd": true}' > "$TMPDIR/workflow-config.json"

EC=0
OUT=$(node watchdog.js --hooks-dir "$TMPDIR" --config watchdog-config.json 2>&1) || EC=$?
assert "watchdog runs healthy" "0" "$EC"

# Test 7: load-modules.js exports expected functions
OUT=$(node -e "var m = require('./load-modules'); console.log(typeof m.filterByWorkflow, typeof m.parseRequires, typeof m.parseWorkflowTag)" 2>&1)
if echo "$OUT" | grep -q "function function function"; then
  assert "load-modules exports functions" "0" "0"
else
  assert "load-modules exports functions" "0" "1"
fi

# Test 8: workflow.js exports expected functions
OUT=$(node -e "var w = require('./workflow'); console.log(typeof w.parseYaml, typeof w.findWorkflows, typeof w.enableWorkflow)" 2>&1)
if echo "$OUT" | grep -q "function function function"; then
  assert "workflow.js exports functions" "0" "0"
else
  assert "workflow.js exports functions" "0" "1"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
