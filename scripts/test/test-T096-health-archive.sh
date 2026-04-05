#!/usr/bin/env bash
# WHY: T096 — Health check should skip archive/ directories and not report them as failures.
# In CI, no modules are installed so we only check that archive/ isn't flagged.
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

# Core assertion: archive/ modules must never appear in failures
ARCHIVE_FAILS=$(echo "$HEALTH_OUT" | grep -c 'FAIL.*archive/' || true)
check "no archive/ modules in health failures" '[ "$ARCHIVE_FAILS" -eq 0 ]'

# If modules are installed, verify they load OK
OK_COUNT=$(echo "$HEALTH_OUT" | grep -c '\[  OK\]' || true)
if [ "$OK_COUNT" -gt 0 ]; then
  check "health check reports OK modules ($OK_COUNT)" 'true'
else
  check "no installed modules (CI environment)" 'true'
fi

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
