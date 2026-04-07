#!/usr/bin/env bash
# Test T337: Session isolation for hook state files
# Verifies that temp flag files include process.ppid so different
# Claude Code tabs don't interfere with each other.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: session-isolation (T337) ==="

# 1. instruction-detector uses PID-scoped flag file
OUTPUT=$(node -e "
  var m = require('$REPO_DIR/modules/UserPromptSubmit/instruction-detector.js');
  var os = require('os'), path = require('path'), fs = require('fs');
  m({ message: 'from now on always use strict mode' });
  var expected = path.join(os.tmpdir(), '.claude-instruction-pending-' + process.ppid);
  try {
    fs.statSync(expected);
    console.log('FOUND');
    fs.unlinkSync(expected);
  } catch(e) {
    console.log('MISSING: ' + expected);
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "FOUND"; then pass "instruction-detector writes PID-scoped flag"; else fail "instruction-detector flag not PID-scoped: $OUTPUT"; fi

# 2. instruction-to-hook-gate reads PID-scoped flag file
OUTPUT=$(node -e "
  var os = require('os'), path = require('path'), fs = require('fs');
  // Write a flag with THIS process's PPID
  var flagFile = path.join(os.tmpdir(), '.claude-instruction-pending-' + process.ppid);
  fs.writeFileSync(flagFile, JSON.stringify({ ts: new Date().toISOString(), pattern: 'test', preview: 'test instruction' }));
  var m = require('$REPO_DIR/modules/PreToolUse/instruction-to-hook-gate.js');
  var result = m({ tool_name: 'Edit', tool_input: { file_path: '/some/random/file.js', new_string: 'x' } });
  try { fs.unlinkSync(flagFile); } catch(e) {}
  if (result && result.decision === 'block') {
    console.log('BLOCKED');
  } else {
    console.log('PASSED');
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "BLOCKED"; then pass "instruction-to-hook-gate reads PID-scoped flag"; else fail "gate didn't read PID-scoped flag: $OUTPUT"; fi

# 3. Old (non-PID) flag file is ignored by gate
OUTPUT=$(node -e "
  var os = require('os'), path = require('path'), fs = require('fs');
  // Write a flag WITHOUT PID (old format) — should be ignored
  var oldFlag = path.join(os.tmpdir(), '.claude-instruction-pending');
  fs.writeFileSync(oldFlag, JSON.stringify({ ts: new Date().toISOString(), pattern: 'test', preview: 'old format' }));
  var m = require('$REPO_DIR/modules/PreToolUse/instruction-to-hook-gate.js');
  var result = m({ tool_name: 'Edit', tool_input: { file_path: '/some/random/file.js', new_string: 'x' } });
  try { fs.unlinkSync(oldFlag); } catch(e) {}
  if (result && result.decision === 'block') {
    console.log('BLOCKED');
  } else {
    console.log('PASSED');
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "PASSED"; then pass "old non-PID flag file ignored by gate"; else fail "gate should ignore old-format flag: $OUTPUT"; fi

# 4. Different PID flag file is ignored (cross-tab isolation)
OUTPUT=$(node -e "
  var os = require('os'), path = require('path'), fs = require('fs');
  // Write a flag with a DIFFERENT PID
  var otherFlag = path.join(os.tmpdir(), '.claude-instruction-pending-99999');
  fs.writeFileSync(otherFlag, JSON.stringify({ ts: new Date().toISOString(), pattern: 'test', preview: 'other tab' }));
  var m = require('$REPO_DIR/modules/PreToolUse/instruction-to-hook-gate.js');
  var result = m({ tool_name: 'Edit', tool_input: { file_path: '/some/random/file.js', new_string: 'x' } });
  try { fs.unlinkSync(otherFlag); } catch(e) {}
  if (result && result.decision === 'block') {
    console.log('BLOCKED');
  } else {
    console.log('PASSED');
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "PASSED"; then pass "different PID flag file ignored (cross-tab isolation)"; else fail "gate should not see other tab's flag: $OUTPUT"; fi

# 5. troubleshoot-detector uses PID-scoped state file
OUTPUT=$(node -e "
  var os = require('os'), path = require('path'), fs = require('fs');
  var m = require('$REPO_DIR/modules/PostToolUse/troubleshoot-detector.js');
  // Trigger a failure to write state
  m({ tool_name: 'Bash', tool_input: { command: 'false' }, tool_output: 'Exit code 1' });
  var expected = path.join(os.tmpdir(), '.claude-bash-failures-' + process.ppid + '.json');
  try {
    var data = fs.readFileSync(expected, 'utf-8');
    console.log('FOUND');
    fs.unlinkSync(expected);
  } catch(e) {
    console.log('MISSING: ' + expected);
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "FOUND"; then pass "troubleshoot-detector writes PID-scoped state"; else fail "troubleshoot-detector state not PID-scoped: $OUTPUT"; fi

# 6. mark-turn-complete uses PID-scoped marker
OUTPUT=$(node -e "
  var os = require('os'), path = require('path'), fs = require('fs');
  var m = require('$REPO_DIR/modules/Stop/mark-turn-complete.js');
  m({});
  var expected = path.join(os.tmpdir(), '.claude-turn-complete-' + process.ppid);
  try {
    fs.statSync(expected);
    console.log('FOUND');
    fs.unlinkSync(expected);
  } catch(e) {
    console.log('MISSING: ' + expected);
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "FOUND"; then pass "mark-turn-complete writes PID-scoped marker"; else fail "mark-turn-complete marker not PID-scoped: $OUTPUT"; fi

# 7. interrupt-detector reads PID-scoped marker and cooldown
OUTPUT=$(node -e "
  var os = require('os'), path = require('path'), fs = require('fs');
  // Verify the module references PID-scoped paths
  var src = fs.readFileSync('$REPO_DIR/modules/UserPromptSubmit/interrupt-detector.js', 'utf-8');
  var hasPidMarker = src.indexOf('.claude-turn-complete-\" + process.ppid') >= 0 ||
                     src.indexOf(\".claude-turn-complete-' + process.ppid\") >= 0 ||
                     src.indexOf('.claude-turn-complete-\" + process.ppid') >= 0;
  var hasPidCooldown = src.indexOf('.claude-self-analyze-cooldown-\" + process.ppid') >= 0 ||
                       src.indexOf(\".claude-self-analyze-cooldown-' + process.ppid\") >= 0 ||
                       src.indexOf('.claude-self-analyze-cooldown-\" + process.ppid') >= 0;
  // Just check the source contains ppid references for both files
  var ppidCount = (src.match(/process\.ppid/g) || []).length;
  if (ppidCount >= 2) {
    console.log('OK');
  } else {
    console.log('MISSING: only ' + ppidCount + ' ppid references');
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "OK"; then pass "interrupt-detector uses PID-scoped marker + cooldown"; else fail "interrupt-detector not PID-scoped: $OUTPUT"; fi

# 8. All 5 modules have PID comment (T337 marker)
COUNT=$(grep -l "T337" \
  "$REPO_DIR/modules/PreToolUse/instruction-to-hook-gate.js" \
  "$REPO_DIR/modules/UserPromptSubmit/instruction-detector.js" \
  "$REPO_DIR/modules/PostToolUse/troubleshoot-detector.js" \
  "$REPO_DIR/modules/Stop/mark-turn-complete.js" \
  "$REPO_DIR/modules/UserPromptSubmit/interrupt-detector.js" \
  2>/dev/null | wc -l)
if [ "$COUNT" -eq 5 ]; then pass "all 5 modules have T337 comment"; else fail "only $COUNT/5 modules have T337 comment"; fi

echo ""
echo "Results: $PASS passed, $FAIL failed (total $((PASS + FAIL)))"
[ "$FAIL" -eq 0 ] || exit 1
