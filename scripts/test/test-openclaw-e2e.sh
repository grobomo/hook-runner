#!/usr/bin/env bash
# T475: End-to-end test — verify ported OpenClaw plugin gates match hook-runner behavior
# Tests:
#   Phase 1: Plugin loads in OpenClaw (plugins inspect)
#   Phase 2: Gate functions produce correct block/allow via tsx (e2e-tsx-harness.ts)
#   Phase 3: Cross-validate — OpenClaw plugin vs hook-runner originals (Node.js)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); echo "OK: $1"; }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

# Convert Windows path to WSL path
WSL_REPO="/mnt/c/$(echo "$REPO_DIR" | sed 's|^C:/||;s|^/c/||')"

# ── Phase 1: Plugin loads in OpenClaw ──────────────────────────────────────

echo ""
echo "=== Phase 1: Plugin loads in OpenClaw ==="

INSPECT=$(wsl -e bash -c 'openclaw --profile grobomo-test plugins inspect hook-runner-gates 2>&1' 2>/dev/null | tr -d '\000')

if echo "$INSPECT" | grep -q "Status: loaded"; then
  pass "Plugin status: loaded"
else
  fail "Plugin not loaded (expected 'Status: loaded')"
  echo "  Got: $(echo "$INSPECT" | grep 'Status:' || echo '(no status line)')"
fi

if echo "$INSPECT" | grep -q "before_tool_call"; then
  pass "Plugin exports before_tool_call hook"
else
  fail "Plugin missing before_tool_call hook"
fi

if echo "$INSPECT" | grep -q "Version: 0.1.0"; then
  pass "Plugin version: 0.1.0"
else
  fail "Unexpected plugin version"
fi

# ── Phase 2: Gate functions via tsx ────────────────────────────────────────

echo ""
echo "=== Phase 2: Gate functions via tsx ==="
echo "Running gate tests via tsx in WSL..."

WSL_HARNESS="${WSL_REPO}/scripts/test/e2e-tsx-harness.ts"

TSX_OUTPUT=$(wsl -e bash -c "cd '${WSL_REPO}' && NODE_PATH=/usr/lib/node_modules npx tsx '${WSL_HARNESS}' 2>&1" 2>/dev/null | tr -d '\000')
echo "$TSX_OUTPUT"

TSX_PASS=$(echo "$TSX_OUTPUT" | grep -c "^OK:" || true)
TSX_FAIL=$(echo "$TSX_OUTPUT" | grep -c "^FAIL:" || true)
PASS=$((PASS + TSX_PASS))
FAIL=$((FAIL + TSX_FAIL))

# ── Phase 3: Cross-validate with hook-runner originals ─────────────────────

echo ""
echo "=== Phase 3: Cross-validate with hook-runner originals ==="
echo "Running hook-runner cross-validation..."

CROSS_OUTPUT=$(node "${REPO_DIR}/scripts/test/e2e-cross-validate.js" 2>&1)
echo "$CROSS_OUTPUT"

CROSS_PASS=$(echo "$CROSS_OUTPUT" | grep -c "^OK:" || true)
CROSS_FAIL=$(echo "$CROSS_OUTPUT" | grep -c "^FAIL:" || true)
PASS=$((PASS + CROSS_PASS))
FAIL=$((FAIL + CROSS_FAIL))

# ── Summary ────────────────────────────────────────────────────────────────

echo ""
echo "=== T475 E2E Summary ==="
echo "Total: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS"
