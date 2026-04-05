#!/usr/bin/env bash
# WHY: T205 — verify setup wizard offers default workflows on install
# WHY-FIX: T124 — original test used --global enable/disable, sabotaging real workflow-config.json
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== hook-runner: onboarding workflow setup ==="
PASS=0; FAIL=0

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"; FAIL=$((FAIL+1))
  fi
}

# Test: --help mentions --yes flag
OUT=$(node setup.js --help 2>&1)
if echo "$OUT" | grep -q "\-\-yes"; then
  assert "--help documents --yes flag" "0" "0"
else
  assert "--help documents --yes flag" "0" "1"
fi

# Test: --dry-run --yes shows workflow enablement step
OUT=$(node setup.js --dry-run --yes 2>&1 || true)
if echo "$OUT" | grep -qi "workflow"; then
  assert "dry-run --yes mentions workflow enablement" "0" "0"
else
  assert "dry-run --yes mentions workflow enablement" "0" "1"
fi

# Test: cmdWorkflow enable/disable works using project-scoped temp dir (NEVER --global)
TMPDIR="$(pwd)/.test-tmp-T205-$$"
mkdir -p "$TMPDIR/workflows"
cp workflows/shtd.yml "$TMPDIR/workflows/"
trap 'rm -rf "$TMPDIR"' EXIT

OUT=$(CLAUDE_PROJECT_DIR="$TMPDIR" node setup.js --workflow enable shtd 2>&1 || true)
if echo "$OUT" | grep -qi "enabled\|already"; then
  assert "workflow enable shtd works (project-scoped)" "0" "0"
else
  assert "workflow enable shtd works (project-scoped)" "0" "1"
fi

# Verify it wrote to the temp dir, not global
if [ -f "$TMPDIR/workflow-config.json" ]; then
  assert "config written to temp dir (not global)" "0" "0"
else
  assert "config written to temp dir (not global)" "0" "1"
fi

# Disable using project scope — safe, only affects temp dir
CLAUDE_PROJECT_DIR="$TMPDIR" node setup.js --workflow disable shtd 2>&1 >/dev/null || true

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
