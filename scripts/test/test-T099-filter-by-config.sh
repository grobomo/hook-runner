#!/usr/bin/env bash
# Test T099: filterByWorkflow uses workflow-config.json enable/disable
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
TMPDIR="$REPO_DIR/.test-tmp-T099-$$"
mkdir -p "$TMPDIR/run-modules/PreToolUse"

check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}

cleanup() { mv "$TMPDIR" "${TMPDIR}-done" 2>/dev/null || true; }
trap cleanup EXIT

echo "=== hook-runner: filter by workflow config ==="

# Create test modules — one tagged shtd, one tagged code-quality, one untagged
cat > "$TMPDIR/run-modules/PreToolUse/tagged-shtd.js" << 'JS'
// WORKFLOW: shtd
module.exports = function(input) { return null; };
JS

cat > "$TMPDIR/run-modules/PreToolUse/tagged-cq.js" << 'JS'
// WORKFLOW: code-quality
module.exports = function(input) { return null; };
JS

cat > "$TMPDIR/run-modules/PreToolUse/untagged.js" << 'JS'
module.exports = function(input) { return null; };
JS

# WHY: Override HOME so load-modules.js doesn't read the real global workflow-config.json.
# Without this, global config bleeds into test results.
FAKE_HOME="$TMPDIR/fakehome"
mkdir -p "$FAKE_HOME/.claude/hooks"

# Test: no config file → only untagged modules pass (tagged ones need explicit enable)
RESULT=$(HOME="$FAKE_HOME" USERPROFILE="$FAKE_HOME" CLAUDE_PROJECT_DIR="$TMPDIR" HOOKRUNNER_NO_BUILTIN=1 node -e "
  var lm = require('$REPO_DIR/load-modules.js');
  var mods = lm('$TMPDIR/run-modules/PreToolUse');
  console.log(mods.map(function(m) { return require('path').basename(m, '.js'); }).sort().join(','));
")
check "no config: only untagged passes" '[ "$RESULT" = "untagged" ]'

# Test: enable shtd → tagged-shtd + untagged pass
node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.enableWorkflow('shtd', '$TMPDIR');
"
RESULT2=$(HOME="$FAKE_HOME" USERPROFILE="$FAKE_HOME" CLAUDE_PROJECT_DIR="$TMPDIR" node -e "
  delete require.cache[require.resolve('$REPO_DIR/load-modules.js')];
  delete require.cache[require.resolve('$REPO_DIR/workflow.js')];
  var lm = require('$REPO_DIR/load-modules.js');
  var mods = lm('$TMPDIR/run-modules/PreToolUse');
  console.log(mods.map(function(m) { return require('path').basename(m, '.js'); }).sort().join(','));
")
check "shtd enabled: tagged-shtd + untagged pass" '[ "$RESULT2" = "tagged-shtd,untagged" ]'

# Test: enable both → all three pass
node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.enableWorkflow('code-quality', '$TMPDIR');
"
RESULT3=$(HOME="$FAKE_HOME" USERPROFILE="$FAKE_HOME" CLAUDE_PROJECT_DIR="$TMPDIR" node -e "
  delete require.cache[require.resolve('$REPO_DIR/load-modules.js')];
  delete require.cache[require.resolve('$REPO_DIR/workflow.js')];
  var lm = require('$REPO_DIR/load-modules.js');
  var mods = lm('$TMPDIR/run-modules/PreToolUse');
  console.log(mods.map(function(m) { return require('path').basename(m, '.js'); }).sort().join(','));
")
check "both enabled: all three pass" '[ "$RESULT3" = "tagged-cq,tagged-shtd,untagged" ]'

# Test: disable shtd → tagged-cq + untagged pass
node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.disableWorkflow('shtd', '$TMPDIR');
"
RESULT4=$(HOME="$FAKE_HOME" USERPROFILE="$FAKE_HOME" CLAUDE_PROJECT_DIR="$TMPDIR" node -e "
  delete require.cache[require.resolve('$REPO_DIR/load-modules.js')];
  delete require.cache[require.resolve('$REPO_DIR/workflow.js')];
  var lm = require('$REPO_DIR/load-modules.js');
  var mods = lm('$TMPDIR/run-modules/PreToolUse');
  console.log(mods.map(function(m) { return require('path').basename(m, '.js'); }).sort().join(','));
")
check "shtd disabled: tagged-cq + untagged pass" '[ "$RESULT4" = "tagged-cq,untagged" ]'

# Test: multi-tag module — tagged with both shtd AND starter
cat > "$TMPDIR/run-modules/PreToolUse/multi-tag.js" << 'JS'
// WORKFLOW: shtd, starter
module.exports = function(input) { return null; };
JS

# Reset: disable all, enable only starter
node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.disableWorkflow('code-quality', '$TMPDIR');
  wf.enableWorkflow('starter', '$TMPDIR');
"
RESULT5=$(HOME="$FAKE_HOME" USERPROFILE="$FAKE_HOME" CLAUDE_PROJECT_DIR="$TMPDIR" node -e "
  delete require.cache[require.resolve('$REPO_DIR/load-modules.js')];
  delete require.cache[require.resolve('$REPO_DIR/workflow.js')];
  var lm = require('$REPO_DIR/load-modules.js');
  var mods = lm('$TMPDIR/run-modules/PreToolUse');
  console.log(mods.map(function(m) { return require('path').basename(m, '.js'); }).sort().join(','));
")
check "starter enabled: multi-tag + untagged pass (shtd-only excluded)" '[ "$RESULT5" = "multi-tag,untagged" ]'

# Test: enable shtd too — multi-tag still passes (both workflows active)
node -e "
  var wf = require('$REPO_DIR/workflow.js');
  wf.enableWorkflow('shtd', '$TMPDIR');
"
RESULT6=$(HOME="$FAKE_HOME" USERPROFILE="$FAKE_HOME" CLAUDE_PROJECT_DIR="$TMPDIR" node -e "
  delete require.cache[require.resolve('$REPO_DIR/load-modules.js')];
  delete require.cache[require.resolve('$REPO_DIR/workflow.js')];
  var lm = require('$REPO_DIR/load-modules.js');
  var mods = lm('$TMPDIR/run-modules/PreToolUse');
  console.log(mods.map(function(m) { return require('path').basename(m, '.js'); }).sort().join(','));
")
check "shtd+starter enabled: all tagged + untagged pass" '[ "$RESULT6" = "multi-tag,tagged-shtd,untagged" ]'

# Test: parseWorkflowTags returns both tags
RESULT7=$(node -e "
  var lm = require('$REPO_DIR/load-modules.js');
  var tags = lm.parseWorkflowTags('$TMPDIR/run-modules/PreToolUse/multi-tag.js');
  console.log(tags.join(','));
")
check "parseWorkflowTags returns both tags" '[ "$RESULT7" = "shtd,starter" ]'

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
