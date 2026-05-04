#!/usr/bin/env bash
# Test T604: diagnose.js — hook transparency and auditing
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: diagnose (T604) ==="

DIAGNOSE="$REPO_DIR/diagnose.js"

# Create temp project structures for testing
TMPDIR="${TMPDIR:-/tmp}/hook-diag-test-$$"
trap 'rm -rf "$TMPDIR"' EXIT
mkdir -p "$TMPDIR"

# 1. Diagnose current project (hook-runner) — should find global hooks
OUTPUT=$(node "$DIAGNOSE" "$REPO_DIR" 2>&1) || true
if echo "$OUTPUT" | grep -q "Settings files" && echo "$OUTPUT" | grep -q "Summary"; then
  pass "diagnose produces structured output"
else
  fail "should produce structured output: $OUTPUT"
fi

# 2. JSON mode works
OUTPUT=$(node "$DIAGNOSE" "$REPO_DIR" --json 2>&1) || true
if echo "$OUTPUT" | node -e "JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write('valid')" 2>/dev/null | grep -q "valid"; then
  pass "JSON mode produces valid JSON"
else
  fail "JSON mode should produce valid JSON"
fi

# 3. Detects broken hooks
PROJ_BROKEN="$TMPDIR/proj-broken"
mkdir -p "$PROJ_BROKEN/.claude"
cat > "$PROJ_BROKEN/.claude/settings.json" <<'SETTINGS'
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'python \"$CLAUDE_PROJECT_DIR/.claude/hooks/nonexistent.py\"'",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
SETTINGS
OUTPUT=$(node "$DIAGNOSE" "$PROJ_BROKEN" 2>&1) || true
if echo "$OUTPUT" | grep -q "BROKEN"; then
  pass "detects broken hook (missing script)"
else
  fail "should detect broken hook: $OUTPUT"
fi

# 4. JSON mode reports broken hooks
OUTPUT=$(node "$DIAGNOSE" "$PROJ_BROKEN" --json 2>&1) || true
BROKEN_COUNT=$(echo "$OUTPUT" | node -e "var d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(String(d.summary.brokenHooks))" 2>/dev/null)
if [ "$BROKEN_COUNT" = "1" ]; then
  pass "JSON reports correct broken hook count"
else
  fail "JSON should report 1 broken hook, got: $BROKEN_COUNT"
fi

# 5. --fix removes broken hooks
PROJ_FIX="$TMPDIR/proj-fix"
mkdir -p "$PROJ_FIX/.claude"
cat > "$PROJ_FIX/.claude/settings.json" <<'FSETTINGS'
{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"bash -c 'python \"$CLAUDE_PROJECT_DIR/.claude/hooks/nonexistent.py\"'","timeout":5}]}]}}
FSETTINGS
node "$DIAGNOSE" "$PROJ_FIX" --fix > /dev/null 2>&1 || true
AFTER=$(cat "$PROJ_FIX/.claude/settings.json")
if echo "$AFTER" | grep -q "nonexistent"; then
  fail "fix should remove broken hook"
else
  pass "fix removes broken hook from settings"
fi

# 6. After fix, no broken hooks
OUTPUT=$(node "$DIAGNOSE" "$PROJ_FIX" --json 2>&1) || true
BROKEN_AFTER=$(echo "$OUTPUT" | node -e "var d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(String(d.summary.brokenHooks))" 2>/dev/null)
if [ "$BROKEN_AFTER" = "0" ]; then
  pass "no broken hooks after fix"
else
  fail "should have 0 broken hooks after fix, got: $BROKEN_AFTER"
fi

# 7. Shows ancestor settings files
PROJ_CHILD="$TMPDIR/parent/child"
mkdir -p "$PROJ_CHILD/.claude" "$TMPDIR/parent/.claude"
echo '{}' > "$PROJ_CHILD/.claude/settings.json"
echo '{}' > "$TMPDIR/parent/.claude/settings.json"
OUTPUT=$(node "$DIAGNOSE" "$PROJ_CHILD" 2>&1) || true
if echo "$OUTPUT" | grep -q "ancestor:parent"; then
  pass "shows ancestor settings files"
else
  fail "should show ancestor settings: $OUTPUT"
fi

# 8. Exits with code 1 when broken hooks found
PROJ_EXIT="$TMPDIR/proj-exit-test"
mkdir -p "$PROJ_EXIT/.claude"
printf '%s' '{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"python \"$CLAUDE_PROJECT_DIR/.claude/hooks/missing.py\"","timeout":5}]}]}}' > "$PROJ_EXIT/.claude/settings.json"
EXIT_CODE=0
node "$DIAGNOSE" "$PROJ_EXIT" > /dev/null 2>&1 || EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 1 ]; then
  pass "exits with code 1 on broken hooks"
else
  fail "should exit 1 on broken hooks, got: $EXIT_CODE"
fi

# 9. Exits with code 0 when no broken hooks
PROJ_CLEAN="$TMPDIR/proj-clean"
mkdir -p "$PROJ_CLEAN/.claude"
echo '{"hooks":{}}' > "$PROJ_CLEAN/.claude/settings.json"
node "$DIAGNOSE" "$PROJ_CLEAN" > /dev/null 2>&1
EXIT_CODE=$?
if [ "$EXIT_CODE" -eq 0 ]; then
  pass "exits with code 0 when healthy"
else
  fail "should exit 0 when healthy, got: $EXIT_CODE"
fi

# 10. Helper files (_prefixed) not counted as broken modules
OUTPUT=$(node "$DIAGNOSE" "$REPO_DIR" --json 2>&1) || true
BROKEN_MODS=$(echo "$OUTPUT" | node -e "var d=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.stdout.write(String(d.modules.broken.length))" 2>/dev/null)
if [ "$BROKEN_MODS" = "0" ]; then
  pass "helper files (_prefixed) not flagged as broken modules"
else
  fail "should have 0 broken modules, got: $BROKEN_MODS"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
