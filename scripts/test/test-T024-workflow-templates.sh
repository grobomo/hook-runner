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

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
