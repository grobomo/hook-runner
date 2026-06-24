#!/usr/bin/env bash
# T738: Test stop-health-report safety net in run-stop.js
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PASS=0; FAIL=0; TOTAL=0

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Set up minimal environment
mkdir -p "$TMPDIR/run-modules/Stop/1-haiku"
mkdir -p "$TMPDIR/.claude/hooks"

# Create a do-nothing gate (returns null = pass)
cat > "$TMPDIR/run-modules/Stop/1-haiku/test-pass-gate.js" << 'JS'
// BLOCKING: true
module.exports = function(input) { return null; };
JS

run_test() {
  local desc="$1" expected="$2" input="$3"
  TOTAL=$((TOTAL + 1))
  local output
  output=$(echo "$input" | HOME="$TMPDIR" HOOK_RUNNER_MODULES_DIR="$TMPDIR/run-modules" CLAUDE_SESSION_ID="test-1234" node "$PROJECT_DIR/run-stop.js" 2>/dev/null) || true
  if [[ "$output" == *"$expected"* ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (expected '$expected' in output, got '${output:0:150}')"
  fi
}

run_test_stderr() {
  local desc="$1" expected="$2" input="$3"
  TOTAL=$((TOTAL + 1))
  local errout
  errout=$(echo "$input" | HOME="$TMPDIR" HOOK_RUNNER_MODULES_DIR="$TMPDIR/run-modules" CLAUDE_SESSION_ID="test-1234" node "$PROJECT_DIR/run-stop.js" 2>&1 >/dev/null) || true
  if [[ "$errout" == *"$expected"* ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (expected '$expected' in stderr, got '${errout:0:150}')"
  fi
}

run_test_exit() {
  local desc="$1" expected_exit="$2" input="$3"
  TOTAL=$((TOTAL + 1))
  local rc=0
  echo "$input" | HOME="$TMPDIR" HOOK_RUNNER_MODULES_DIR="$TMPDIR/run-modules" CLAUDE_SESSION_ID="test-1234" node "$PROJECT_DIR/run-stop.js" >/dev/null 2>/dev/null || rc=$?
  if [[ "$rc" -eq "$expected_exit" ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc (exit $rc)"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (expected exit $expected_exit, got $rc)"
  fi
}

echo "=== T738: Stop Health Report Tests ==="

# Test 1: When all gates return null, health report fires
run_test "Health report fires when no module blocked" \
  "stop-health-report" \
  '{"last_assistant_message":"I completed something very important and big enough to not be short"}'

# Test 2: Health report includes module names
run_test "Health report lists loaded modules" \
  "test-pass-gate" \
  '{"last_assistant_message":"I completed something very important and big enough to not be short"}'

# Test 3: Health report exits 1 (visible in TUI)
run_test_exit "Health report forces exit 1" 1 \
  '{"last_assistant_message":"I completed something very important and big enough to not be short"}'

# Test 4: stderr output from health report
run_test_stderr "Health report writes to stderr" \
  "stop-health-report" \
  '{"last_assistant_message":"I completed something very important and big enough to not be short"}'

# Test 5: When a gate DOES block, health report does NOT fire
cat > "$TMPDIR/run-modules/Stop/1-haiku/aaa-blocking-gate.js" << 'JS'
// BLOCKING: true
module.exports = function(input) {
  return { decision: "block", reason: "SELF-CHECK [test]: DONE — test passed" };
};
JS
TOTAL=$((TOTAL + 1))
output=$(echo '{"last_assistant_message":"I completed something very important and big enough to not be short"}' | HOME="$TMPDIR" HOOK_RUNNER_MODULES_DIR="$TMPDIR/run-modules" CLAUDE_SESSION_ID="test-1234" node "$PROJECT_DIR/run-stop.js" 2>/dev/null) || true
if [[ "$output" != *"stop-health-report"* ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: Health report does NOT fire when a gate blocks"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Health report should not fire when gate blocked (got: ${output:0:100})"
fi
rm -f "$TMPDIR/run-modules/Stop/1-haiku/aaa-blocking-gate.js"

# Test 6: Re-entrant stop_hook_active exits silently (T759: re-entries are noise)
TOTAL=$((TOTAL + 1))
errout=$(echo '{"stop_hook_active":true}' | HOME="$TMPDIR" HOOK_RUNNER_MODULES_DIR="$TMPDIR/run-modules" CLAUDE_SESSION_ID="test-1234" node "$PROJECT_DIR/run-stop.js" 2>&1 >/dev/null) || true
if [[ -z "$errout" ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: Re-entrant stop exits silently (T759)"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Re-entrant stop should be silent (got: '${errout:0:100}')"
fi

# Test 7: Re-entrant stop exits 0
TOTAL=$((TOTAL + 1))
rc=0
echo '{"stop_hook_active":true}' | HOME="$TMPDIR" HOOK_RUNNER_MODULES_DIR="$TMPDIR/run-modules" CLAUDE_SESSION_ID="test-1234" node "$PROJECT_DIR/run-stop.js" >/dev/null 2>/dev/null || rc=$?
if [[ "$rc" -eq 0 ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: Re-entrant stop exits 0"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Re-entrant stop should exit 0 (got $rc)"
fi

# Test 8: Health report reason includes CONTINUE
run_test "Health report reason says CONTINUE" \
  "CONTINUE" \
  '{"last_assistant_message":"I completed something very important and big enough to not be short"}'

echo ""
echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
