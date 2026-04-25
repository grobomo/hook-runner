#!/usr/bin/env bash
# Test T024: --workflow templates + --from-template flag
# WHY: Users need curated starting points for workflows, not empty scaffolds.
# This test verifies template listing and creation from templates.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: workflow templates ==="

TMPDIR="$REPO_DIR/.test-tmp-T024-$$"
mkdir -p "$TMPDIR/workflows"
trap 'rm -rf "$TMPDIR"' EXIT

# 1. --workflow templates lists available templates
TPL_OUT=$(cd "$REPO_DIR" && node setup.js --workflow templates 2>&1) || true
check "templates command works" 'echo "$TPL_OUT" | grep -qi "security"'
check "templates shows quality" 'echo "$TPL_OUT" | grep -qi "quality"'
check "templates shows lifecycle" 'echo "$TPL_OUT" | grep -qi "lifecycle"'
check "templates shows minimal" 'echo "$TPL_OUT" | grep -qi "minimal"'
check "templates shows module counts" 'echo "$TPL_OUT" | grep -q "[0-9] module"'

# 2. --from-template creates workflow with pre-populated modules
CREATE_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create my-sec --from-template security --dir "$TMPDIR" 2>&1) || true
check "create from template succeeds" 'echo "$CREATE_OUT" | grep -qi "created"'
check "YAML file exists" '[ -f "$TMPDIR/workflows/my-sec.yml" ]'

# 3. Created workflow has modules from the template
check "has force-push-gate" 'grep -q "force-push-gate" "$TMPDIR/workflows/my-sec.yml"'
check "has secret-scan-gate" 'grep -q "secret-scan-gate" "$TMPDIR/workflows/my-sec.yml"'
check "has git-destructive-guard" 'grep -q "git-destructive-guard" "$TMPDIR/workflows/my-sec.yml"'
check "modules is not empty array" '! grep -q "modules: \[\]" "$TMPDIR/workflows/my-sec.yml"'

# 4. Created workflow has correct name and description
check "YAML has correct name" 'grep -q "name: my-sec" "$TMPDIR/workflows/my-sec.yml"'
check "description from template" 'grep -qi "secret scanning" "$TMPDIR/workflows/my-sec.yml"'

# 5. Create from minimal template
MIN_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create my-min --from-template minimal --dir "$TMPDIR" 2>&1) || true
check "minimal template creates" 'echo "$MIN_OUT" | grep -qi "created"'
check "minimal has fewer modules" '
  SEC_COUNT=$(grep -c "^  - " "$TMPDIR/workflows/my-sec.yml" || true)
  MIN_COUNT=$(grep -c "^  - " "$TMPDIR/workflows/my-min.yml" || true)
  [ "$MIN_COUNT" -lt "$SEC_COUNT" ]
'

# 6. Invalid template name shows error
BAD_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create bad-wf --from-template nonexistent --dir "$TMPDIR" 2>&1) || true
check "invalid template shows error" 'echo "$BAD_OUT" | grep -qi "unknown\|not found\|invalid\|available"'
check "invalid template does not create file" '[ ! -f "$TMPDIR/workflows/bad-wf.yml" ]'

# 7. --from-template without --workflow create shows error
NOARG_OUT=$(cd "$REPO_DIR" && node setup.js --from-template security 2>&1) || true
check "from-template alone shows usage" 'echo "$NOARG_OUT" | grep -qi "usage\|create\|template"'

# 8. Module validation — security template modules should all exist in catalog or live hooks
SEC_VALID_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create val-test --from-template security --dir "$TMPDIR" 2>&1) || true
check "no missing modules warning for security" '! echo "$SEC_VALID_OUT" | grep -qi "not found in catalog"'

# 9. Template composition — combine multiple templates
COMBO_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create combo-test --from-template security,quality --dir "$TMPDIR" 2>&1) || true
check "composition creates workflow" 'echo "$COMBO_OUT" | grep -qi "created"'
check "composition YAML exists" '[ -f "$TMPDIR/workflows/combo-test.yml" ]'
check "composition has security module" 'grep -q "force-push-gate" "$TMPDIR/workflows/combo-test.yml"'
check "composition has quality module" 'grep -q "test-coverage-check" "$TMPDIR/workflows/combo-test.yml"'
check "composition deduplicates" '
  COUNT=$(grep -c "force-push-gate" "$TMPDIR/workflows/combo-test.yml" || true)
  [ "$COUNT" -eq 1 ]
'

# 10. Composition with minimal+security should deduplicate shared modules
DEDUP_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create dedup-test --from-template minimal,security --dir "$TMPDIR" 2>&1) || true
check "dedup creates workflow" 'echo "$DEDUP_OUT" | grep -qi "created"'
check "dedup has no duplicate force-push-gate" '
  COUNT=$(grep -c "force-push-gate" "$TMPDIR/workflows/dedup-test.yml" || true)
  [ "$COUNT" -eq 1 ]
'

# 11. --from-template with no value shows usage error
EDGE_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create test-edge --from-template --dir "$TMPDIR" 2>&1) || true
check "edge: --from-template with no value" 'echo "$EDGE_OUT" | grep -qi "usage"'

# 12. --from-template at end of args shows usage error
EDGE2_OUT=$(cd "$REPO_DIR" && node setup.js --workflow create test-edge2 --from-template 2>&1) || true
check "edge: --from-template at end" 'echo "$EDGE2_OUT" | grep -qi "usage"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
