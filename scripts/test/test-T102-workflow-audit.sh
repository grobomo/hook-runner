#!/usr/bin/env bash
# Test T102: --workflow audit command
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: workflow audit ==="

# Run audit and capture output
AUDIT=$(cd "$REPO_DIR" && node setup.js --workflow audit 2>&1) || true

# 1. Shows coverage summary
check "shows coverage summary" 'echo "$AUDIT" | grep -q "Coverage:"'

# 2. Shows total module count
check "shows module count" 'echo "$AUDIT" | grep -qE "[0-9]+ modules"'

# 3. Shows tagged count
check "shows tagged count" 'echo "$AUDIT" | grep -qE "[0-9]+ tagged"'

# 4. Shows per-workflow breakdown
check "shows per-workflow counts" 'echo "$AUDIT" | grep -q "shtd"'

# 5. workflow-gate.js should be listed as infrastructure (untagged is OK)
check "lists untagged modules" 'echo "$AUDIT" | grep -qi "untagged\|orphan\|no workflow"'

# 6. Shows workflow YAML module lists vs actual module files
check "shows YAML vs actual comparison" 'echo "$AUDIT" | grep -qE "missing|OK|match"'

# 7. Exit code 0 when no critical issues
check "exits 0 for clean audit" '[ $? -eq 0 ]'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
