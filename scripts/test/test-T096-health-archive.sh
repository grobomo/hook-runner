#!/usr/bin/env bash
# Test T096: Health check should skip archive/ directories
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0

check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}

echo "=== hook-runner: health check archive skip ==="

# Run health check and capture output
HEALTH_OUT=$(node "$REPO_DIR/setup.js" --health 2>&1 || true)

# Check no archive/ modules appear in failures
ARCHIVE_FAILS=$(echo "$HEALTH_OUT" | grep -c 'FAIL.*archive/' || true)
check "no archive/ modules in health failures" '[ "$ARCHIVE_FAILS" -eq 0 ]'

# Check health check still reports OK for non-archive modules
OK_COUNT=$(echo "$HEALTH_OUT" | grep -c '\[  OK\]' || true)
check "health check reports OK modules ($OK_COUNT)" '[ "$OK_COUNT" -gt 0 ]'

# Check zero failures total
FAIL_COUNT=$(echo "$HEALTH_OUT" | grep -oP '\d+ failures' | grep -oP '\d+' || echo "0")
check "zero total failures" '[ "$FAIL_COUNT" -eq 0 ]'

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
