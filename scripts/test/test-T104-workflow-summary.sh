#!/usr/bin/env bash
# Test T104: workflow-summary SessionStart module
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
REPO_DIR_WIN=$(cd "$REPO_DIR" && (pwd -W 2>/dev/null || pwd))
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: workflow summary ==="

# 1. Module loads and exports a function
check "module exports function" 'node -e "var m = require(\"$REPO_DIR_WIN/modules/SessionStart/workflow-summary.js\"); console.log(typeof m);" 2>&1 | grep -q "function"'

# 2. Returns null when no workflows enabled
# WHY: Override HOME to isolate from global workflow-config.json
FAKE_HOME="$REPO_DIR/.test-tmp-T104-fakehome-$$"
mkdir -p "$FAKE_HOME/.claude/hooks"
OUT_NONE=$(HOME="$FAKE_HOME" USERPROFILE="$FAKE_HOME" node -e "
  delete require.cache[require.resolve('$REPO_DIR_WIN/workflow.js')];
  var old = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = '$REPO_DIR_WIN/.test-tmp-T104-$$';
  var m = require('$REPO_DIR_WIN/modules/SessionStart/workflow-summary.js');
  var r = m({});
  console.log(r === null ? 'null' : JSON.stringify(r));
  process.env.CLAUDE_PROJECT_DIR = old || '';
" 2>&1) || true
rm -rf "$FAKE_HOME"
check "returns null with no workflows" 'echo "$OUT_NONE" | grep -q "null"'

# 3. Returns text when workflows are enabled (use temp dir with config)
TMPDIR="$REPO_DIR/.test-tmp-T104-$$"
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT
TMPDIR_WIN=$(cd "$TMPDIR" && (pwd -W 2>/dev/null || pwd))
echo '{"shtd": true}' > "$TMPDIR/workflow-config.json"

OUT_ENABLED=$(node -e "
  // Clear caches
  Object.keys(require.cache).forEach(function(k) { if (k.indexOf('workflow') !== -1) delete require.cache[k]; });
  process.env.CLAUDE_PROJECT_DIR = '$TMPDIR_WIN';
  var m = require('$REPO_DIR_WIN/modules/SessionStart/workflow-summary.js');
  var r = m({});
  console.log(r && r.text ? r.text : 'null');
" 2>&1) || true
check "returns text with shtd enabled" 'echo "$OUT_ENABLED" | grep -q "ACTIVE WORKFLOWS"'
check "mentions shtd in output" 'echo "$OUT_ENABLED" | grep -q "shtd"'

# 4. Has WORKFLOW tag
check "has WORKFLOW tag" 'head -1 "$REPO_DIR/modules/SessionStart/workflow-summary.js" | grep -q "WORKFLOW: shtd"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
