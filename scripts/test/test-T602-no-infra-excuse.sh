#!/usr/bin/env bash
# Test T602: no-infra-excuse PostToolUse module
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: no-infra-excuse (T602) ==="

MODULE="$REPO_DIR/modules/PostToolUse/no-infra-excuse.js"

run_check() {
  local tool="$1"
  local result_text="$2"
  node -e "
    var mod = require('$MODULE');
    var r = mod({ tool_name: '$tool', tool_result: process.argv[1] });
    if (r && r.decision === 'block') {
      process.stdout.write('BLOCKED: ' + r.reason.split('\n')[0]);
      process.exit(1);
    } else {
      process.stdout.write('PASSED');
    }
  " "$result_text" 2>&1 || true
}

# 1. "requires a real environment" triggers block
OUTPUT=$(run_check "Bash" "This requires a real environment to test properly")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "requires real environment blocked"
else
  fail "should block real environment excuse: $OUTPUT"
fi

# 2. "can't test without a running server" triggers block
OUTPUT=$(run_check "Bash" "I can't test this without a running server")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "can't test without running blocked"
else
  fail "should block can't test excuse: $OUTPUT"
fi

# 3. "needs lab infrastructure" triggers block
OUTPUT=$(run_check "Bash" "This feature needs lab infrastructure to verify")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "needs lab infrastructure blocked"
else
  fail "should block lab infrastructure excuse: $OUTPUT"
fi

# 4. "requires a testing environment" triggers block
OUTPUT=$(run_check "Bash" "Deployment requires a testing environment for validation")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "requires testing environment blocked"
else
  fail "should block testing environment excuse: $OUTPUT"
fi

# 5. "cannot be tested locally" triggers block
OUTPUT=$(run_check "Bash" "This API endpoint cannot be tested locally")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "cannot be tested locally blocked"
else
  fail "should block locally excuse: $OUTPUT"
fi

# 6. Normal output passes
OUTPUT=$(run_check "Bash" "Tests passed: 15/15. All checks green.")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "normal output passes"
else
  fail "normal output should pass: $OUTPUT"
fi

# 7. Read tool is skipped entirely
OUTPUT=$(run_check "Read" "This requires a real environment to test")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Read tool skipped"
else
  fail "Read should be skipped: $OUTPUT"
fi

# 8. Short output passes (< 30 chars)
OUTPUT=$(run_check "Bash" "needs real environment")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "short output passes"
else
  fail "short output should pass: $OUTPUT"
fi

# 9. Legitimate mention of environment (not an excuse) passes
OUTPUT=$(run_check "Bash" "Setting up the test environment variables for CI pipeline")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "legitimate environment mention passes"
else
  fail "legitimate mention should pass: $OUTPUT"
fi

# 10. Block message mentions available infrastructure
OUTPUT=$(run_check "Bash" "This would need a live environment to validate the deployment")
if echo "$OUTPUT" | grep -q "BLOCKED.*infrastructure\|BLOCKED.*testing"; then
  pass "block message identifies as infra excuse"
else
  fail "should have BLOCKED format: $OUTPUT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
