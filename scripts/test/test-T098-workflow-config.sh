#!/usr/bin/env bash
# Test T098: workflow-config.json enable/disable state management
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
TMPDIR="$REPO_DIR/.test-tmp-T098"
rm -rf "$TMPDIR"; mkdir -p "$TMPDIR"
trap "rm -rf $TMPDIR" EXIT

check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}

echo "=== hook-runner: workflow config ==="

# Test readConfig returns empty when no file
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var cfg = wf.readConfig('$TMPDIR');
  console.log(JSON.stringify(cfg));
")
check "readConfig returns {} for missing file" '[ "$RESULT" = "{}" ]'

# Test enableWorkflow creates config
node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.enableWorkflow('shtd', '$TMPDIR');
"
check "workflow-config.json created" '[ -f "$TMPDIR/workflow-config.json" ]'

ENABLED=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var cfg = wf.readConfig('$TMPDIR');
  console.log(cfg.shtd ? 'yes' : 'no');
")
check "shtd workflow enabled" '[ "$ENABLED" = "yes" ]'

# Test disableWorkflow
node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.disableWorkflow('shtd', '$TMPDIR');
"
DISABLED=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var cfg = wf.readConfig('$TMPDIR');
  console.log(cfg.shtd === false ? 'yes' : 'no');
")
check "shtd workflow disabled" '[ "$DISABLED" = "yes" ]'

# Test multiple workflows
node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.enableWorkflow('shtd', '$TMPDIR');
  wf.enableWorkflow('code-quality', '$TMPDIR');
  wf.disableWorkflow('messaging-safety', '$TMPDIR');
"
MULTI=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var cfg = wf.readConfig('$TMPDIR');
  var ok = cfg.shtd === true && cfg['code-quality'] === true && cfg['messaging-safety'] === false;
  console.log(ok ? 'yes' : 'no');
")
check "multiple workflow states" '[ "$MULTI" = "yes" ]'

# Test isWorkflowEnabled
IS_EN=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.enableWorkflow('shtd', '$TMPDIR');
  console.log(wf.isWorkflowEnabled('shtd', '$TMPDIR') ? 'yes' : 'no');
")
check "isWorkflowEnabled returns true" '[ "$IS_EN" = "yes" ]'

IS_DIS=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  console.log(wf.isWorkflowEnabled('nonexistent', '$TMPDIR') ? 'yes' : 'no');
")
check "isWorkflowEnabled returns false for unknown" '[ "$IS_DIS" = "no" ]'

# Test enabledWorkflows returns list
LIST=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.enableWorkflow('shtd', '$TMPDIR');
  wf.enableWorkflow('code-quality', '$TMPDIR');
  wf.disableWorkflow('messaging-safety', '$TMPDIR');
  var list = wf.enabledWorkflows('$TMPDIR');
  console.log(list.sort().join(','));
")
check "enabledWorkflows returns enabled list" '[ "$LIST" = "code-quality,shtd" ]'

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
