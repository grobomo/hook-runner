#!/usr/bin/env bash
# Test T640: Spirit-check system (spirit-check.js + violation-gate.js)
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: Spirit-check system (T640) ==="

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
TMPDIR_ABS=$(cd "$TMPDIR" && (pwd -W 2>/dev/null || pwd))

# --- Section 1: Module contract checks ---

SPIRIT="$REPO_DIR/modules/PostToolUse/spirit-check.js"
VGATE="$REPO_DIR/modules/PreToolUse/violation-gate.js"

# 1. spirit-check.js has TOOLS tag
if grep -q '// TOOLS:' "$SPIRIT"; then
  pass "spirit-check.js has TOOLS tag"
else
  fail "spirit-check.js missing TOOLS tag"
fi

# 2. spirit-check.js has WHY tag
if grep -q '// WHY:' "$SPIRIT"; then
  pass "spirit-check.js has WHY tag"
else
  fail "spirit-check.js missing WHY tag"
fi

# 3. spirit-check.js has WORKFLOW tag
if grep -q '// WORKFLOW:' "$SPIRIT"; then
  pass "spirit-check.js has WORKFLOW tag"
else
  fail "spirit-check.js missing WORKFLOW tag"
fi

# 4. spirit-check.js has INCIDENT HISTORY
if grep -q 'INCIDENT HISTORY' "$SPIRIT"; then
  pass "spirit-check.js has INCIDENT HISTORY"
else
  fail "spirit-check.js missing INCIDENT HISTORY"
fi

# 5. spirit-check.js has logging
if grep -q 'appendFileSync' "$SPIRIT"; then
  pass "spirit-check.js has logging"
else
  fail "spirit-check.js missing logging"
fi

# 6. violation-gate.js has TOOLS tag
if grep -q '// TOOLS:' "$VGATE"; then
  pass "violation-gate.js has TOOLS tag"
else
  fail "violation-gate.js missing TOOLS tag"
fi

# 7. violation-gate.js has WHY tag
if grep -q '// WHY:' "$VGATE"; then
  pass "violation-gate.js has WHY tag"
else
  fail "violation-gate.js missing WHY tag"
fi

# 8. violation-gate.js has INCIDENT HISTORY
if grep -q 'INCIDENT HISTORY' "$VGATE"; then
  pass "violation-gate.js has INCIDENT HISTORY"
else
  fail "violation-gate.js missing INCIDENT HISTORY"
fi

# 9. violation-gate.js has logging
if grep -q 'appendFileSync' "$VGATE"; then
  pass "violation-gate.js has logging"
else
  fail "violation-gate.js missing logging"
fi

# --- Section 2: violation-gate unit tests ---

STATE_FILE="$TMPDIR_ABS/violation-state.json"

# 10. No state file → pass
RESULT=$(HOME="$TMPDIR_ABS" node -e "
  process.env.HOME = '$TMPDIR_ABS';
  var gate = require('$VGATE');
  var r = gate({tool_name:'Bash', tool_input:{command:'echo hi'}});
  console.log(r === null ? 'PASS' : 'BLOCK');
")
if [ "$RESULT" = "PASS" ]; then
  pass "violation-gate passes when no state file"
else
  fail "violation-gate should pass without state file — got: $RESULT"
fi

# 11. State file with acknowledged=true → pass
mkdir -p "$TMPDIR/.claude/hooks"
echo '{"violation":true,"acknowledged":true,"rule":"test"}' > "$TMPDIR/.claude/hooks/violation-state.json"
RESULT=$(HOME="$TMPDIR_ABS" node -e "
  process.env.HOME = '$TMPDIR_ABS';
  delete require.cache[require.resolve('$VGATE')];
  var gate = require('$VGATE');
  var r = gate({tool_name:'Bash', tool_input:{command:'echo hi'}});
  console.log(r === null ? 'PASS' : 'BLOCK');
")
if [ "$RESULT" = "PASS" ]; then
  pass "violation-gate passes when already acknowledged"
else
  fail "violation-gate should pass when acknowledged — got: $RESULT"
fi

# 12. State file with violation=true, acknowledged=false → block
echo '{"violation":true,"acknowledged":false,"rule":"test-rule","severity":"high","violation_description":"test desc"}' > "$TMPDIR/.claude/hooks/violation-state.json"
RESULT=$(HOME="$TMPDIR_ABS" node -e "
  process.env.HOME = '$TMPDIR_ABS';
  delete require.cache[require.resolve('$VGATE')];
  var gate = require('$VGATE');
  var r = gate({tool_name:'Bash', tool_input:{command:'echo hi'}});
  console.log(r && r.decision === 'block' ? 'BLOCK' : 'PASS');
  if (r) console.log(r.reason.split('\\n')[0]);
")
if echo "$RESULT" | head -1 | grep -q "BLOCK"; then
  pass "violation-gate blocks on unacknowledged violation"
else
  fail "violation-gate should block — got: $RESULT"
fi

# 13. After block, acknowledged is set to true
AFTER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$TMPDIR_ABS/.claude/hooks/violation-state.json','utf-8')).acknowledged)")
if [ "$AFTER" = "true" ]; then
  pass "violation-gate sets acknowledged=true after block"
else
  fail "Expected acknowledged=true, got: $AFTER"
fi

# 14. Second call after block → pass (acknowledged)
RESULT=$(HOME="$TMPDIR_ABS" node -e "
  process.env.HOME = '$TMPDIR_ABS';
  delete require.cache[require.resolve('$VGATE')];
  var gate = require('$VGATE');
  var r = gate({tool_name:'Bash', tool_input:{command:'echo hi'}});
  console.log(r === null ? 'PASS' : 'BLOCK');
")
if [ "$RESULT" = "PASS" ]; then
  pass "violation-gate passes after acknowledgement"
else
  fail "violation-gate should pass after acknowledgement — got: $RESULT"
fi

# 15. Block message mentions the rule name
echo '{"violation":true,"acknowledged":false,"rule":"archive-spirit","severity":"high","violation_description":"moved file to /dev/null"}' > "$TMPDIR/.claude/hooks/violation-state.json"
REASON=$(HOME="$TMPDIR_ABS" node -e "
  process.env.HOME = '$TMPDIR_ABS';
  delete require.cache[require.resolve('$VGATE')];
  var gate = require('$VGATE');
  var r = gate({tool_name:'Bash', tool_input:{command:'echo hi'}});
  console.log(r ? r.reason : 'null');
")
if echo "$REASON" | grep -q "archive-spirit"; then
  pass "Block message includes rule name"
else
  fail "Block message should include rule name — got: $REASON"
fi

# 16. Block message mentions violation-analysis.md
if echo "$REASON" | grep -q "violation-analysis.md"; then
  pass "Block message mentions violation-analysis.md"
else
  fail "Block message should mention violation-analysis.md"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
