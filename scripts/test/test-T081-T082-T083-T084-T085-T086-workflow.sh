#!/usr/bin/env bash
# Test workflow engine: YAML parsing, state management, gate checking, module filtering
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0
FAIL=0
# Use Windows-safe temp dir (Git Bash /tmp maps to C:\tmp which may not exist)
WFTMP="$REPO_DIR/.test-tmp-wf-$$"
mkdir -p "$WFTMP"
# Get Windows path for Node.js
WFTMP_WIN="$(cd "$WFTMP" && (pwd -W 2>/dev/null || pwd))"

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

cleanup() { rm -rf "$WFTMP"; }
trap cleanup EXIT

echo "=== hook-runner: workflow tests ==="

# --- YAML Parser ---

echo "[1] parseYaml: top-level scalars"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var r = wf.parseYaml('name: test\nversion: 2\nenabled: true');
  console.log(r.name, r.version, r.enabled);
" 2>/dev/null)
[ "$RESULT" = "test 2 true" ] && pass "scalars parsed" || fail "got: $RESULT"

echo "[2] parseYaml: array of objects"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var r = wf.parseYaml('steps:\n  - id: one\n    name: Step One\n  - id: two\n    name: Step Two');
  console.log(r.steps.length, r.steps[0].id, r.steps[1].id);
" 2>/dev/null)
[ "$RESULT" = "2 one two" ] && pass "array parsed" || fail "got: $RESULT"

echo "[3] parseYaml: nested sub-objects (gate)"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var text = 'steps:\n  - id: build\n    gate:\n      require_step: setup';
  var r = wf.parseYaml(text);
  console.log(r.steps[0].gate.require_step);
" 2>/dev/null)
[ "$RESULT" = "setup" ] && pass "nested objects parsed" || fail "got: $RESULT"

echo "[4] parseYaml: inline arrays"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var r = wf.parseYaml('tags: [a, b, c]');
  console.log(r.tags.length, r.tags.join(','));
" 2>/dev/null)
[ "$RESULT" = "3 a,b,c" ] && pass "inline arrays" || fail "got: $RESULT"

# --- Workflow Loading ---

echo "[5] loadWorkflow: built-in enforce-shtd.yml"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var w = wf.loadWorkflow('$REPO_DIR/workflows/enforce-shtd.yml');
  console.log(w.name, w.steps.length);
" 2>/dev/null)
[ "$RESULT" = "enforce-shtd 8" ] && pass "enforce-shtd loaded" || fail "got: $RESULT"

echo "[6] findWorkflows: discovers built-in workflows"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var all = wf.findWorkflows('$WFTMP_WIN');
  console.log(all.length >= 2 ? 'ok' : 'fail');
" 2>/dev/null)
[ "$RESULT" = "ok" ] && pass "found built-in workflows" || fail "got: $RESULT"

# --- State Management ---

echo "[7] initState + readState"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.initState('enforce-shtd', '$REPO_DIR/workflows/enforce-shtd.yml', '$WFTMP_WIN');
  var state = wf.readState('$WFTMP_WIN');
  console.log(state.workflow, Object.keys(state.steps).length);
" 2>/dev/null)
[ "$RESULT" = "enforce-shtd 8" ] && pass "state initialized" || fail "got: $RESULT"

echo "[8] currentStep returns first step"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var cur = wf.currentStep('$WFTMP_WIN');
  console.log(cur);
" 2>/dev/null)
[ "$RESULT" = "spec" ] && pass "current step = spec" || fail "got: $RESULT"

echo "[9] completeStep advances to next"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.completeStep('spec', '$WFTMP_WIN');
  var cur = wf.currentStep('$WFTMP_WIN');
  console.log(cur);
" 2>/dev/null)
[ "$RESULT" = "tasks" ] && pass "advanced to tasks" || fail "got: $RESULT"

echo "[10] resetState clears state"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.resetState('$WFTMP_WIN');
  var state = wf.readState('$WFTMP_WIN');
  console.log(state === null ? 'cleared' : 'still exists');
" 2>/dev/null)
[ "$RESULT" = "cleared" ] && pass "state reset" || fail "got: $RESULT"

# --- Gate Checking ---

echo "[11] checkGate blocks on missing prerequisite step"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.initState('enforce-shtd', '$REPO_DIR/workflows/enforce-shtd.yml', '$WFTMP_WIN');
  var check = wf.checkGate('tasks', '$WFTMP_WIN');
  console.log(check.allowed ? 'allowed' : 'blocked');
" 2>/dev/null)
[ "$RESULT" = "blocked" ] && pass "gate blocks missing prereq" || fail "got: $RESULT"

echo "[12] checkGate allows after prereq completed"
RESULT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.completeStep('spec', '$WFTMP_WIN');
  var check = wf.checkGate('tasks', '$WFTMP_WIN');
  console.log(check.allowed ? 'allowed' : 'blocked');
" 2>/dev/null)
[ "$RESULT" = "allowed" ] && pass "gate allows after prereq" || fail "got: $RESULT"

# --- Workflow Module Filtering (load-modules.js) ---

echo "[13] parseWorkflowTag: extracts tag"
cat > "$WFTMP/tagged-mod.js" << 'MODEOF'
// WHY: test module
// WORKFLOW: enforce-shtd
module.exports = function(input) { return null; };
MODEOF

RESULT=$(node -e "
  var lm = require('$REPO_DIR/load-modules.js');
  console.log(lm.parseWorkflowTag('$WFTMP_WIN/tagged-mod.js'));
" 2>/dev/null)
[ "$RESULT" = "enforce-shtd" ] && pass "workflow tag parsed" || fail "got: $RESULT"

echo "[14] parseWorkflowTag: returns null for untagged"
cat > "$WFTMP/plain-mod.js" << 'MODEOF'
// WHY: plain module
module.exports = function(input) { return null; };
MODEOF

RESULT=$(node -e "
  var lm = require('$REPO_DIR/load-modules.js');
  console.log(lm.parseWorkflowTag('$WFTMP_WIN/plain-mod.js'));
" 2>/dev/null)
[ "$RESULT" = "null" ] && pass "no tag = null" || fail "got: $RESULT"

echo "[15] filterByWorkflow: keeps untagged, skips inactive workflow modules"
mkdir -p "$WFTMP/test-event"
cat > "$WFTMP/test-event/always.js" << 'MODEOF'
module.exports = function(input) { return null; };
MODEOF
cat > "$WFTMP/test-event/wf-only.js" << 'MODEOF'
// WORKFLOW: enforce-shtd
module.exports = function(input) { return null; };
MODEOF

# Reset state first to ensure no active workflow
node -e "var wf = require('$REPO_DIR/workflow.js'); wf.resetState('$WFTMP_WIN');" 2>/dev/null

RESULT=$(node -e "
  process.env.CLAUDE_PROJECT_DIR = '$WFTMP_WIN';
  delete require.cache[require.resolve('$REPO_DIR/load-modules.js')];
  var lm = require('$REPO_DIR/load-modules.js');
  var paths = ['$WFTMP_WIN/test-event/always.js', '$WFTMP_WIN/test-event/wf-only.js'];
  var filtered = lm.filterByWorkflow(paths);
  console.log(filtered.length);
" 2>/dev/null)
[ "$RESULT" = "1" ] && pass "skips inactive workflow module" || fail "got: $RESULT"

echo "[16] filterByWorkflow: keeps tagged module when workflow active"
RESULT=$(node -e "
  process.env.CLAUDE_PROJECT_DIR = '$WFTMP_WIN';
  var wf = require('$REPO_DIR/workflow.js');
  wf.initState('enforce-shtd', '$REPO_DIR/workflows/enforce-shtd.yml', '$WFTMP_WIN');
  delete require.cache[require.resolve('$REPO_DIR/load-modules.js')];
  var lm = require('$REPO_DIR/load-modules.js');
  var paths = ['$WFTMP_WIN/test-event/always.js', '$WFTMP_WIN/test-event/wf-only.js'];
  var filtered = lm.filterByWorkflow(paths);
  console.log(filtered.length);
" 2>/dev/null)
[ "$RESULT" = "2" ] && pass "keeps module when workflow active" || fail "got: $RESULT"

# Clean up workflow state
node -e "var wf = require('$REPO_DIR/workflow.js'); wf.resetState('$WFTMP_WIN');" 2>/dev/null

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
