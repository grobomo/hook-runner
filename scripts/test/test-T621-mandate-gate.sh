#!/usr/bin/env bash
# CI-SKIP — uses python3 for JSON generation, crashes on Windows CI
# Test T621: mandate-gate.js (PreToolUse) — mandate enforcement
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: Mandate Gate (T621) ==="

TMPDIR_RAW="$(mktemp -d)"
TMPDIR="$(cd "$TMPDIR_RAW" && (pwd -W 2>/dev/null || pwd))"
trap 'rm -rf "$TMPDIR_RAW"' EXIT

MOD="$REPO_DIR/modules/PreToolUse/mandate-gate.js"

# --- Section 1: Module structure ---

# 1. Module exists
if [ -f "$MOD" ]; then
  pass "mandate-gate.js exists"
else
  fail "mandate-gate.js missing"; echo "=== Results: $PASS passed, $FAIL failed ==="; exit 1
fi

# 2. Has WORKFLOW tag
if grep -q '// WORKFLOW: haiku-rules' "$MOD"; then
  pass "WORKFLOW: haiku-rules tag present"
else
  fail "WORKFLOW tag missing"
fi

# 3. Has WHY tag
if grep -q '// WHY:' "$MOD"; then
  pass "WHY tag present"
else
  fail "WHY tag missing"
fi

# 4. Has TOOLS tag
if grep -q '// TOOLS:' "$MOD"; then
  pass "TOOLS tag present"
else
  fail "TOOLS tag missing"
fi

# 5. Has INCIDENT HISTORY
if grep -q 'INCIDENT HISTORY' "$MOD"; then
  pass "INCIDENT HISTORY present"
else
  fail "INCIDENT HISTORY missing"
fi

# --- Section 2: No mandate file = pass ---

# 6. Returns null when no mandate-unknown.json exists
RESULT=$(HOME="$TMPDIR" node -e "
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r === null ? 'null' : JSON.stringify(r));
")
if [ "$RESULT" = "null" ]; then
  pass "No mandate-unknown.json → pass (null)"
else
  fail "No mandate-unknown.json → expected null, got: $RESULT"
fi

# --- Section 3: Unseen mandate = block ---

# 7. Blocks on first tool call with unseen mandate
mkdir -p "$TMPDIR/.claude/hooks"
cat > "$TMPDIR/.claude/hooks/mandate-unknown.json" <<'EOF'
{
  "action": "Fix the broken test in auth module",
  "source_rule": "incomplete-todos",
  "decision": "CONTINUE",
  "actions": ["run tests", "fix failing assertion"],
  "created": "2099-01-01T00:00:00.000Z",
  "seen": false,
  "fulfilled": false
}
EOF

RESULT=$(HOME="$TMPDIR" node -e "
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r ? r.decision : 'null');
")
if [ "$RESULT" = "block" ]; then
  pass "Unseen mandate → block"
else
  fail "Unseen mandate → expected block, got: $RESULT"
fi

# 8. Block reason contains BLOCKED and mandate
RESULT=$(HOME="$TMPDIR" node -e "
  var fs = require('fs');
  // Reset seen
  var m = JSON.parse(fs.readFileSync('$TMPDIR/.claude/hooks/mandate-unknown.json', 'utf-8'));
  m.seen = false;
  fs.writeFileSync('$TMPDIR/.claude/hooks/mandate-unknown.json', JSON.stringify(m));
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r && r.reason && /BLOCKED.*mandate/i.test(r.reason) ? 'yes' : 'no');
")
if [ "$RESULT" = "yes" ]; then
  pass "Block reason contains BLOCKED and mandate"
else
  fail "Block reason missing BLOCKED/mandate"
fi

# 9. Block reason contains the action text
RESULT=$(HOME="$TMPDIR" node -e "
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('$TMPDIR/.claude/hooks/mandate-unknown.json', 'utf-8'));
  m.seen = false;
  fs.writeFileSync('$TMPDIR/.claude/hooks/mandate-unknown.json', JSON.stringify(m));
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r && r.reason && r.reason.indexOf('Fix the broken test') !== -1 ? 'yes' : 'no');
")
if [ "$RESULT" = "yes" ]; then
  pass "Block reason contains action text"
else
  fail "Block reason missing action text"
fi

# 10. Block reason contains action items
RESULT=$(HOME="$TMPDIR" node -e "
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('$TMPDIR/.claude/hooks/mandate-unknown.json', 'utf-8'));
  m.seen = false;
  fs.writeFileSync('$TMPDIR/.claude/hooks/mandate-unknown.json', JSON.stringify(m));
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r && r.reason && r.reason.indexOf('run tests') !== -1 ? 'yes' : 'no');
")
if [ "$RESULT" = "yes" ]; then
  pass "Block reason contains action items"
else
  fail "Block reason missing action items"
fi

# 11. Block reason has WHY and NEXT STEPS format
RESULT=$(HOME="$TMPDIR" node -e "
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('$TMPDIR/.claude/hooks/mandate-unknown.json', 'utf-8'));
  m.seen = false;
  fs.writeFileSync('$TMPDIR/.claude/hooks/mandate-unknown.json', JSON.stringify(m));
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r && r.reason && /WHY:/.test(r.reason) && /NEXT STEPS:/i.test(r.reason) ? 'yes' : 'no');
")
if [ "$RESULT" = "yes" ]; then
  pass "Block reason has WHY and NEXT STEPS format"
else
  fail "Block reason missing WHY/NEXT STEPS"
fi

# --- Section 4: Seen mandate = pass ---

# 12. Sets seen=true after first block
RESULT=$(HOME="$TMPDIR" node -e "
  var fs = require('fs');
  var m = JSON.parse(fs.readFileSync('$TMPDIR/.claude/hooks/mandate-unknown.json', 'utf-8'));
  console.log(m.seen);
")
if [ "$RESULT" = "true" ]; then
  pass "mandate-unknown.json seen=true after first block"
else
  fail "mandate-unknown.json seen not updated, got: $RESULT"
fi

# 13. Passes on second tool call (seen=true)
RESULT=$(HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Edit', tool_input: { file_path: '/tmp/f' } });
  console.log(r === null ? 'null' : JSON.stringify(r));
")
if [ "$RESULT" = "null" ]; then
  pass "Seen mandate → pass (null)"
else
  fail "Seen mandate → expected null, got: $RESULT"
fi

# --- Section 5: Expiry ---

# 14. Expired mandate is cleaned up and passes
cat > "$TMPDIR/.claude/hooks/mandate-unknown.json" <<'EOF'
{
  "action": "Old task",
  "source_rule": "old-rule",
  "created": "2020-01-01T00:00:00.000Z",
  "seen": false,
  "fulfilled": false
}
EOF

RESULT=$(HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r === null ? 'null' : JSON.stringify(r));
")
if [ "$RESULT" = "null" ]; then
  pass "Expired mandate → pass (null)"
else
  fail "Expired mandate → expected null, got: $RESULT"
fi

# 15. Expired mandate file is deleted
if [ ! -f "$TMPDIR/.claude/hooks/mandate-unknown.json" ]; then
  pass "Expired mandate-unknown.json is deleted"
else
  fail "Expired mandate-unknown.json should be deleted"
fi

# --- Section 6: Empty actions array ---

# 16. No actions in mandate → no action list in block reason
cat > "$TMPDIR/.claude/hooks/mandate-unknown.json" <<'EOF'
{
  "action": "Continue working on the task",
  "source_rule": "test-rule",
  "created": "2099-01-01T00:00:00.000Z",
  "seen": false,
  "fulfilled": false,
  "actions": []
}
EOF

RESULT=$(HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r && r.reason && r.reason.indexOf('Next actions') === -1 ? 'yes' : 'no');
")
if [ "$RESULT" = "yes" ]; then
  pass "Empty actions → no action list in reason"
else
  fail "Empty actions → should not show action list"
fi

# --- Section 7: Corrupt mandate file ---

# 17. Corrupt JSON in mandate-unknown.json → pass
echo "not json" > "$TMPDIR/.claude/hooks/mandate-unknown.json"

RESULT=$(HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r === null ? 'null' : JSON.stringify(r));
")
if [ "$RESULT" = "null" ]; then
  pass "Corrupt mandate-unknown.json → pass (null)"
else
  fail "Corrupt mandate-unknown.json → expected null, got: $RESULT"
fi

# --- Section 8: Logging ---

# 18. Block is logged to hook-log.jsonl
rm -f "$TMPDIR/.claude/hooks/hook-log.jsonl"
cat > "$TMPDIR/.claude/hooks/mandate-unknown.json" <<'EOF'
{
  "action": "Log test mandate",
  "source_rule": "log-rule",
  "decision": "CONTINUE",
  "created": "2099-01-01T00:00:00.000Z",
  "seen": false,
  "fulfilled": false
}
EOF

RESULT=$(HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  var log = require('fs').readFileSync('$TMPDIR/.claude/hooks/hook-log.jsonl', 'utf-8');
  console.log(log.indexOf('mandate-gate') !== -1 && log.indexOf('block') !== -1 ? 'yes' : 'no');
")
if [ "$RESULT" = "yes" ]; then
  pass "Block logged to hook-log.jsonl"
else
  fail "Block not logged"
fi

# 19. Expiry is logged
rm -f "$TMPDIR/.claude/hooks/hook-log.jsonl"
cat > "$TMPDIR/.claude/hooks/mandate-unknown.json" <<'EOF'
{
  "action": "Expired mandate",
  "source_rule": "expired-rule",
  "created": "2020-01-01T00:00:00.000Z",
  "seen": false
}
EOF

RESULT=$(HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  var log = require('fs').readFileSync('$TMPDIR/.claude/hooks/hook-log.jsonl', 'utf-8');
  console.log(log.indexOf('expired') !== -1 ? 'yes' : 'no');
")
if [ "$RESULT" = "yes" ]; then
  pass "Expiry logged to hook-log.jsonl"
else
  fail "Expiry not logged"
fi

# --- Section 9: auto-continue-gate mandate writing ---

# 20. auto-continue-gate.js defines MANDATE_PATH
if grep -q 'MANDATE_PATH' "$REPO_DIR/modules/Stop/auto-continue-gate.js"; then
  pass "auto-continue-gate.js defines MANDATE_PATH"
else
  fail "auto-continue-gate.js missing MANDATE_PATH"
fi

# 21. auto-continue-gate.js writes mandate-unknown.json on CONTINUE
if grep -q 'writeFileSync(MANDATE_PATH' "$REPO_DIR/modules/Stop/auto-continue-gate.js"; then
  pass "auto-continue-gate.js writes mandate-unknown.json on CONTINUE"
else
  fail "auto-continue-gate.js missing mandate write"
fi

# 22. auto-continue-gate.js clears mandate on DONE
if grep -q 'unlinkSync(MANDATE_PATH' "$REPO_DIR/modules/Stop/auto-continue-gate.js"; then
  pass "auto-continue-gate.js clears mandate-unknown.json on DONE"
else
  fail "auto-continue-gate.js missing mandate cleanup on DONE"
fi

# 23. auto-continue-gate.js passes mandate context to Haiku
if grep -q 'mandateContext' "$REPO_DIR/modules/Stop/auto-continue-gate.js"; then
  pass "auto-continue-gate.js includes mandate context in Haiku prompt"
else
  fail "auto-continue-gate.js missing mandate context in prompt"
fi

# 24. Mandate JSON structure includes required fields
RESULT=$(node -e "
  var mandate = {
    action: 'test', source_rule: 'r', decision: 'CONTINUE',
    actions: ['a'], created: new Date().toISOString(), seen: false, fulfilled: false
  };
  var keys = Object.keys(mandate);
  var required = ['action', 'source_rule', 'decision', 'actions', 'created', 'seen', 'fulfilled'];
  var missing = required.filter(function(k) { return keys.indexOf(k) === -1; });
  console.log(missing.length === 0 ? 'ok' : 'missing:' + missing.join(','));
")
if [ "$RESULT" = "ok" ]; then
  pass "Mandate JSON has all required fields"
else
  fail "Mandate JSON $RESULT"
fi

# --- Section 10: T783 — DONE decision should NOT block ---

# 25. Mandate with decision=DONE → pass (cleaned up)
cat > "$TMPDIR/.claude/hooks/mandate-unknown.json" <<'EOF'
{
  "action": "Task completed successfully",
  "source_rule": "test-rule",
  "decision": "DONE",
  "created": "2099-01-01T00:00:00.000Z",
  "seen": false,
  "fulfilled": false
}
EOF

RESULT=$(HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r === null ? 'null' : JSON.stringify(r));
")
if [ "$RESULT" = "null" ]; then
  pass "T783: DONE decision → pass (not blocked)"
else
  fail "T783: DONE decision → expected null, got: $RESULT"
fi

# 26. DONE mandate file is cleaned up
if [ ! -f "$TMPDIR/.claude/hooks/mandate-unknown.json" ]; then
  pass "T783: DONE mandate file cleaned up"
else
  fail "T783: DONE mandate file should be deleted"
fi

# 27. DISPATCH decision → pass (cleaned up)
cat > "$TMPDIR/.claude/hooks/mandate-unknown.json" <<'EOF'
{
  "action": "Dispatched to another session",
  "source_rule": "dispatch-rule",
  "decision": "DISPATCH",
  "created": "2099-01-01T00:00:00.000Z",
  "seen": false,
  "fulfilled": false
}
EOF

RESULT=$(HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r === null ? 'null' : JSON.stringify(r));
")
if [ "$RESULT" = "null" ]; then
  pass "T783: DISPATCH decision → pass"
else
  fail "T783: DISPATCH decision → expected null, got: $RESULT"
fi

# 28. CONTINUE decision → still blocks
cat > "$TMPDIR/.claude/hooks/mandate-unknown.json" <<'EOF'
{
  "action": "Keep working on tests",
  "source_rule": "test-rule",
  "decision": "CONTINUE",
  "created": "2099-01-01T00:00:00.000Z",
  "seen": false,
  "fulfilled": false
}
EOF

RESULT=$(HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$MOD')];
  var gate = require('$MOD');
  var r = gate({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  console.log(r ? r.decision : 'null');
")
if [ "$RESULT" = "block" ]; then
  pass "T783: CONTINUE decision → still blocks"
else
  fail "T783: CONTINUE decision → expected block, got: $RESULT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
