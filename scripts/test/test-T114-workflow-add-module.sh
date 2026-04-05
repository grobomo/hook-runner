#!/usr/bin/env bash
# Test T114: --workflow add-module and --workflow sync-live
# WHY: Automating module creation prevents tag mismatches, missing WHY stubs,
# and forgotten live sync — the three most common workflow maintenance errors.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: workflow add-module ==="

# Test add-module to existing workflow (code-quality)
# Use a temp module name that won't conflict
TMPMOD="test-tmp-mod-$$"

ADD_OUT=$(cd "$REPO_DIR" && node setup.js --workflow add-module code-quality "$TMPMOD" 2>&1) || true
check "add-module succeeds" 'echo "$ADD_OUT" | grep -qi "created"'

# Module file exists
check "module file created" '[ -f "$REPO_DIR/modules/PreToolUse/$TMPMOD.js" ]'

# Module has WORKFLOW tag
check "module has WORKFLOW tag" 'head -1 "$REPO_DIR/modules/PreToolUse/$TMPMOD.js" | grep -q "WORKFLOW: code-quality"'

# Module has WHY stub
check "module has WHY stub" 'grep -q "WHY: TODO" "$REPO_DIR/modules/PreToolUse/$TMPMOD.js"'

# Module added to YAML
check "module in YAML" 'grep -q "$TMPMOD" "$REPO_DIR/workflows/code-quality.yml"'

# No arg shows usage
NOARG_OUT=$(cd "$REPO_DIR" && node setup.js --workflow add-module 2>&1) || true
check "no arg shows usage" 'echo "$NOARG_OUT" | grep -qi "usage"'

# Test sync-live
SYNC_OUT=$(cd "$REPO_DIR" && node setup.js --workflow sync-live 2>&1) || true
check "sync-live succeeds" 'echo "$SYNC_OUT" | grep -qi "synced"'

# Live copy exists
check "live copy exists" '[ -f "$HOME/.claude/hooks/run-modules/PreToolUse/$TMPMOD.js" ]'

# Cleanup: remove temp module from repo and live
rm -f "$REPO_DIR/modules/PreToolUse/$TMPMOD.js"
rm -f "$HOME/.claude/hooks/run-modules/PreToolUse/$TMPMOD.js"
# Remove from YAML
cd "$REPO_DIR" && git checkout -- workflows/code-quality.yml 2>/dev/null || true

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
