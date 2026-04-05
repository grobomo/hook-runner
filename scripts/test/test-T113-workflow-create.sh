#!/usr/bin/env bash
# Test T113: --workflow create command
# WHY: Manual workflow creation requires editing 3+ files. This test ensures
# the CLI automates YAML generation, module stubs, and live sync correctly.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: workflow create ==="

TMPDIR="$REPO_DIR/.test-tmp-T113-$$"
mkdir -p "$TMPDIR/workflows"
trap 'rm -rf "$TMPDIR"' EXIT

# 1. Create a workflow
CREATE_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create test-wf --dir "$TMPDIR" 2>&1) || true
check "create succeeds" 'echo "$CREATE_OUT" | grep -qi "created"'

# 2. YAML file exists
check "YAML file created" '[ -f "$TMPDIR/workflows/test-wf.yml" ]'

# 3. YAML has correct name
check "YAML has name field" 'grep -q "name: test-wf" "$TMPDIR/workflows/test-wf.yml"'

# 4. YAML has description field
check "YAML has description" 'grep -q "description:" "$TMPDIR/workflows/test-wf.yml"'

# 5. YAML has modules section
check "YAML has modules section" 'grep -q "modules:" "$TMPDIR/workflows/test-wf.yml"'

# 6. YAML has steps section
check "YAML has steps section" 'grep -q "steps:" "$TMPDIR/workflows/test-wf.yml"'

# 7. No arg shows usage
NOARG_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create 2>&1) || true
check "no arg shows usage" 'echo "$NOARG_OUT" | grep -qi "usage"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
