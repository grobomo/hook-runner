#!/usr/bin/env bash
# Test T097: Workflow YAML files have modules: field listing member modules
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0

check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}

echo "=== hook-runner: workflow modules field ==="

# Every workflow YAML should have a modules: section
for yml in "$REPO_DIR"/workflows/*.yml; do
  name=$(basename "$yml" .yml)
  check "$name.yml has modules: field" "grep -q '^modules:' '$yml'"
done

# workflow.js loadWorkflow should parse modules field
MOD_COUNT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var w = wf.loadWorkflow('$REPO_DIR/workflows/shtd.yml');
  console.log((w.modules || []).length);
")
check "shtd workflow has modules listed" '[ "$MOD_COUNT" -gt 0 ]'

# Modules listed in workflows should exist in modules/ catalog
MISSING=""
for yml in "$REPO_DIR"/workflows/*.yml; do
  name=$(basename "$yml" .yml)
  # Extract module names from modules: section
  node -e "
    var wf = require('$REPO_DIR/workflow.js');
    var w = wf.loadWorkflow('$yml');
    var mods = w.modules || [];
    mods.forEach(function(m) { console.log(m); });
  " | while read mod; do
    # Check if module exists somewhere in modules/
    found=$(find "$REPO_DIR/modules" -name "${mod}.js" 2>/dev/null | head -1)
    if [ -z "$found" ]; then
      MISSING="$MISSING $name:$mod"
    fi
  done
done
check "all workflow modules exist in catalog" '[ -z "$MISSING" ]'

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
