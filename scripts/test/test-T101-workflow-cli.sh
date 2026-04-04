#!/usr/bin/env bash
# Test T101: workflow CLI enable/disable/list commands
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
TMPDIR="$REPO_DIR/.test-tmp-T101-$$"
mkdir -p "$TMPDIR"
cleanup() { mv "$TMPDIR" "${TMPDIR}-done" 2>/dev/null || true; }
trap cleanup EXIT

check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}

echo "=== hook-runner: workflow CLI ==="

# Test --workflow list shows workflows with module counts
LIST=$(CLAUDE_PROJECT_DIR="$TMPDIR" node "$REPO_DIR/setup.js" --workflow list 2>&1)
check "list shows shtd workflow" 'echo "$LIST" | grep -q "shtd"'
check "list shows module counts" 'echo "$LIST" | grep -q "modules"'

# Test --workflow enable
ENABLE_OUT=$(CLAUDE_PROJECT_DIR="$TMPDIR" node "$REPO_DIR/setup.js" --workflow enable shtd 2>&1)
check "enable shtd succeeds" 'echo "$ENABLE_OUT" | grep -qi "enabled"'
check "config file created" '[ -f "$TMPDIR/workflow-config.json" ]'

# Verify enabled state
ENABLED=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  console.log(wf.isWorkflowEnabled('shtd', '$TMPDIR') ? 'yes' : 'no');
")
check "shtd is enabled in config" '[ "$ENABLED" = "yes" ]'

# Test --workflow disable
DISABLE_OUT=$(CLAUDE_PROJECT_DIR="$TMPDIR" node "$REPO_DIR/setup.js" --workflow disable shtd 2>&1)
check "disable shtd succeeds" 'echo "$DISABLE_OUT" | grep -qi "disabled"'

DISABLED=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  console.log(wf.isWorkflowEnabled('shtd', '$TMPDIR') ? 'yes' : 'no');
")
check "shtd is disabled in config" '[ "$DISABLED" = "no" ]'

# Test --workflow enable another workflow (project-level only, never touch global)
CLAUDE_PROJECT_DIR="$TMPDIR" node "$REPO_DIR/setup.js" --workflow enable code-quality 2>&1 > /dev/null
CQ_ENABLED=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  console.log(wf.isWorkflowEnabled('code-quality', '$TMPDIR') ? 'yes' : 'no');
")
check "code-quality enabled (project)" '[ "$CQ_ENABLED" = "yes" ]'

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
