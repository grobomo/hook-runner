#!/usr/bin/env bash
PASS=0; FAIL=0; ERRORS=""
assert_pass() { PASS=$((PASS+1)); }
assert_fail() { FAIL=$((FAIL+1)); ERRORS="${ERRORS}\n  FAIL: $1"; }

MODULE="modules/PreToolUse/stop-fired-check-gate.js"
BASE_DIR_RAW="${TMPDIR:-/tmp}/stop-check-$$"
mkdir -p "$BASE_DIR_RAW"
BASE_DIR="$(cd "$BASE_DIR_RAW" && (pwd -W 2>/dev/null || pwd))"
HOOKS_DIR="$BASE_DIR/.claude/hooks"
mkdir -p "$HOOKS_DIR"

cleanup() { rm -rf "$BASE_DIR_RAW"; }
trap cleanup EXIT

run_gate() {
  local session="${SESSION_ID:-abcd1234xxxx}"
  HOOK_RUNNER_TEST="" \
  HOME="$BASE_DIR" \
  CLAUDE_SESSION_ID="$session" \
  node -e "
    process.env.HOME = '$BASE_DIR';
    var gate = require('./$MODULE');
    var result = gate({});
    if (result) process.stdout.write(JSON.stringify(result));
  " 2>/dev/null || true
}

SESSION_ID="abcd1234xxxx"
S="abcd1234"

# T1: No marker files → pass
rm -f "$HOOKS_DIR/.last-turn-start-$S" "$HOOKS_DIR/.last-stop-fired-$S" "$HOOKS_DIR/.stop-gap-alerted-$S"
result=$(run_gate)
[ -z "$result" ] && assert_pass || assert_fail "T1: no markers should pass, got: $result"

# T2: Turn 1 → always pass (no previous stop expected)
echo "{\"session\":\"$S\",\"turn\":1,\"ts\":\"2026-05-22T10:00:00Z\"}" > "$HOOKS_DIR/.last-turn-start-$S"
echo "{\"session\":\"$S\",\"turn\":0,\"ts\":\"2026-05-22T09:59:00Z\"}" > "$HOOKS_DIR/.last-stop-fired-$S"
rm -f "$HOOKS_DIR/.stop-gap-alerted-$S"
result=$(run_gate)
[ -z "$result" ] && assert_pass || assert_fail "T2: turn 1 should pass, got: $result"

# T3: Turn 2, stop fired for turn 1 → pass
echo "{\"session\":\"$S\",\"turn\":2,\"ts\":\"2026-05-22T10:01:00Z\"}" > "$HOOKS_DIR/.last-turn-start-$S"
echo "{\"session\":\"$S\",\"turn\":1,\"ts\":\"2026-05-22T10:00:30Z\"}" > "$HOOKS_DIR/.last-stop-fired-$S"
rm -f "$HOOKS_DIR/.stop-gap-alerted-$S"
result=$(run_gate)
[ -z "$result" ] && assert_pass || assert_fail "T3: stop fired for prev turn should pass, got: $result"

# T4: Turn 3, stop only fired for turn 1 → BLOCK
echo "{\"session\":\"$S\",\"turn\":3,\"ts\":\"2026-05-22T10:02:00Z\"}" > "$HOOKS_DIR/.last-turn-start-$S"
echo "{\"session\":\"$S\",\"turn\":1,\"ts\":\"2026-05-22T10:00:30Z\"}" > "$HOOKS_DIR/.last-stop-fired-$S"
rm -f "$HOOKS_DIR/.stop-gap-alerted-$S"
result=$(run_gate)
echo "$result" | grep -q '"decision":"block"' && assert_pass || assert_fail "T4: missed stop should block, got: $result"

# T5: Block message has BLOCKED/WHY format
echo "$result" | grep -q "BLOCKED" && echo "$result" | grep -q "WHY:" && assert_pass || assert_fail "T5: should have BLOCKED/WHY format, got: $result"

# T6: Second call in same turn → pass (already alerted)
result=$(run_gate)
[ -z "$result" ] && assert_pass || assert_fail "T6: second call should pass (already alerted), got: $result"

# T7: Different session in stop marker → pass
echo "{\"session\":\"$S\",\"turn\":5,\"ts\":\"2026-05-22T10:05:00Z\"}" > "$HOOKS_DIR/.last-turn-start-$S"
echo "{\"session\":\"other123\",\"turn\":1,\"ts\":\"2026-05-22T09:00:00Z\"}" > "$HOOKS_DIR/.last-stop-fired-$S"
rm -f "$HOOKS_DIR/.stop-gap-alerted-$S"
result=$(run_gate)
[ -z "$result" ] && assert_pass || assert_fail "T7: different session in stop should pass, got: $result"

# T8: No session ID env → pass
result=$(SESSION_ID="" run_gate)
[ -z "$result" ] && assert_pass || assert_fail "T8: no session ID should pass, got: $result"

# T9: HOOK_RUNNER_TEST=1 → pass
result=$(HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$MODULE');
  var r = gate({});
  if (r) process.stdout.write(JSON.stringify(r));
" 2>/dev/null || true)
[ -z "$result" ] && assert_pass || assert_fail "T9: test mode should pass, got: $result"

# T10: Multiple missed turns → still blocks
echo "{\"session\":\"$S\",\"turn\":6,\"ts\":\"2026-05-22T10:06:00Z\"}" > "$HOOKS_DIR/.last-turn-start-$S"
echo "{\"session\":\"$S\",\"turn\":2,\"ts\":\"2026-05-22T10:01:00Z\"}" > "$HOOKS_DIR/.last-stop-fired-$S"
rm -f "$HOOKS_DIR/.stop-gap-alerted-$S"
result=$(run_gate)
echo "$result" | grep -q '"decision":"block"' && assert_pass || assert_fail "T10: multiple missed turns should block, got: $result"

# T11: Block has NEXT STEPS
echo "$result" | grep -q "NEXT STEPS" && assert_pass || assert_fail "T11: block should include NEXT STEPS"
echo "$result" | grep -q "stop hook" && assert_pass || assert_fail "T12: block should mention stop hook"

# T13: Turn marker from different session → pass
echo "{\"session\":\"xxxxxxxx\",\"turn\":10,\"ts\":\"2026-05-22T10:10:00Z\"}" > "$HOOKS_DIR/.last-turn-start-$S"
echo "{\"session\":\"$S\",\"turn\":2,\"ts\":\"2026-05-22T10:01:00Z\"}" > "$HOOKS_DIR/.last-stop-fired-$S"
rm -f "$HOOKS_DIR/.stop-gap-alerted-$S"
result=$(run_gate)
[ -z "$result" ] && assert_pass || assert_fail "T13: turn from other session should pass, got: $result"

echo ""
echo "=== stop-fired-check-gate: $PASS passed, $FAIL failed ==="
[ $FAIL -gt 0 ] && echo -e "$ERRORS" && exit 1
exit 0
