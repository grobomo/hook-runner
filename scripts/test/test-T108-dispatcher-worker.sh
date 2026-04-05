#!/usr/bin/env bash
# Test T108: dispatcher-worker.yml workflow definition
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
check() { if eval "$2" >/dev/null 2>&1; then pass "$1"; else fail "$1"; fi; }

echo "=== hook-runner: dispatcher-worker workflow (T108) ==="

WF="$REPO_DIR/workflows/dispatcher-worker.yml"

# 1. File exists
check "workflow YAML exists" "[ -f '$WF' ]"

# 2. Has name field
check "has name field" "grep -q '^name: dispatcher-worker' '$WF'"

# 3. Has description
check "has description" "grep -q 'description:' '$WF'"

# 4. Has dispatcher steps
check "has dispatcher spec step" "grep -q 'role: dispatcher' '$WF'"

# 5. Has worker steps
check "has worker steps" "grep -q 'role: worker' '$WF'"

# 6. Has modules section
check "has modules section" "grep -q '^modules:' '$WF'"

# 7. References worker-loop module
check "references worker-loop module" "grep -q 'worker-loop' '$WF'"

# 8. workflow.js can parse it
check "workflow.js can parse YAML" "node -e \"
  var wf = require('$REPO_DIR/workflow.js');
  var defs = wf.findWorkflows('$REPO_DIR/workflows');
  var dw = defs.find(function(d) { return d.name === 'dispatcher-worker'; });
  if (!dw) throw new Error('not found');
  if (!dw.steps || dw.steps.length < 5) throw new Error('too few steps: ' + dw.steps.length);
\""

# 9. Steps have role annotations
ROLE_COUNT=$(grep -c 'role:' "$WF" || echo 0)
if [ "$ROLE_COUNT" -ge 5 ]; then
  pass "at least 5 role-annotated steps ($ROLE_COUNT found)"
else
  fail "expected 5+ role annotations, got $ROLE_COUNT"
fi

# 10. Can enable/disable via CLI
OUTPUT=$(node "$REPO_DIR/setup.js" --workflow enable dispatcher-worker 2>&1) || true
if echo "$OUTPUT" | grep -qi "enabled\|already"; then
  pass "workflow enable dispatcher-worker works"
else
  fail "enable dispatcher-worker failed: $OUTPUT"
fi

# Cleanup: disable it (we don't want it active globally)
node "$REPO_DIR/setup.js" --workflow disable dispatcher-worker 2>/dev/null || true

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
