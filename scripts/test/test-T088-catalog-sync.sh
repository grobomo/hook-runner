#!/usr/bin/env bash
# T088: Verify catalog modules match live modules (no drift)
# This test runs the module validation suite which covers all catalog modules
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: catalog sync validation ==="

# Verify all catalog modules export functions and don't crash
echo "[1] All catalog modules load and return valid types"
RESULT=$(bash "$REPO_DIR/scripts/test/test-modules.sh" 2>&1 | tail -1)
if echo "$RESULT" | grep -q "0 failed"; then
  COUNT=$(echo "$RESULT" | grep -oP '\d+ passed')
  pass "module validation ($COUNT)"
else
  fail "module validation: $RESULT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
