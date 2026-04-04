#!/usr/bin/env bash
# Test T103: --workflow query <tool> command
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: workflow query ==="

# 1. Query for Edit shows results
EDIT_OUT=$(cd "$REPO_DIR" && node setup.js --workflow query Edit 2>&1) || true
check "query Edit shows results" 'echo "$EDIT_OUT" | grep -q "Edit"'

# 2. Query for Edit shows spec-gate (known to check Edit)
check "query Edit includes spec-gate" 'echo "$EDIT_OUT" | grep -q "spec-gate"'

# 3. Query for Bash shows results
BASH_OUT=$(cd "$REPO_DIR" && node setup.js --workflow query Bash 2>&1) || true
check "query Bash shows results" 'echo "$BASH_OUT" | grep -q "Bash"'

# 4. Query for unknown tool shows no matches
UNKNOWN_OUT=$(cd "$REPO_DIR" && node setup.js --workflow query FooBarTool 2>&1) || true
check "query unknown tool shows no matches" 'echo "$UNKNOWN_OUT" | grep -qi "no modules"'

# 5. Query with no tool shows usage
NOARG_OUT=$(cd "$REPO_DIR" && node setup.js --workflow query 2>&1) || true
check "query no arg shows usage" 'echo "$NOARG_OUT" | grep -qi "usage"'

# 6. Shows workflow names in output
check "query shows workflow names" 'echo "$EDIT_OUT" | grep -q "shtd\|code-quality"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
