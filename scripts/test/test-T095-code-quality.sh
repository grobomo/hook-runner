#!/usr/bin/env bash
# Test T095: Code quality checks
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0

check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}

echo "=== hook-runner: code quality ==="

# Check no duplicate section number comments in healthCheck
DUPES=$(grep -n '// [0-9]\.' "$REPO_DIR/setup.js" | awk -F'// ' '{print $2}' | sort | uniq -d)
check "no duplicate section numbers in setup.js" '[ -z "$DUPES" ]'

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
