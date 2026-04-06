#!/usr/bin/env bash
# Test specific module behaviors — edge cases, exceptions, and regression tests.
# Unlike test-modules.sh (which validates load/call), this tests logic.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: module behavior tests ==="

# ============================================================
# archive-not-delete: exception patterns
# ============================================================

ARCHIVE_MOD="$REPO_DIR/modules/PreToolUse/archive-not-delete.js"

test_archive_block() {
  local desc="$1" cmd="$2"
  local input="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$cmd\"}}"
  local result
  result=$(node -e "
    var m = require('$ARCHIVE_MOD');
    var r = m($input);
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null)
  if [ "$result" = "block" ]; then
    pass "archive-not-delete blocks: $desc"
  else
    fail "archive-not-delete should block: $desc"
  fi
}

test_archive_pass() {
  local desc="$1" cmd="$2"
  local input="{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"$cmd\"}}"
  local result
  result=$(node -e "
    var m = require('$ARCHIVE_MOD');
    var r = m($input);
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null)
  if [ "$result" = "pass" ]; then
    pass "archive-not-delete allows: $desc"
  else
    fail "archive-not-delete should allow: $desc"
  fi
}

echo ""
echo "[archive-not-delete] destructive commands blocked"
test_archive_block "rm user file" "rm ~/Documents/important.txt"
test_archive_block "rm -rf directory" "rm -rf some-project"
test_archive_block "rmdir" "rmdir /some/dir"

echo ""
echo "[archive-not-delete] exceptions allowed"
test_archive_pass "rm .log file" "rm debug.log"
test_archive_pass "rm .tmp file" "rm session.tmp"
test_archive_pass "rm node_modules" "rm -rf node_modules"
test_archive_pass "git rm --cached" "git rm --cached file.txt"
test_archive_pass "git rm -r --cached" "git rm -r --cached dir/"
test_archive_pass "rm .git/index.lock" "rm ~/.claude/.git/index.lock"
test_archive_pass "rm .git/refs lock" "rm /repo/.git/refs/heads/main.lock"
test_archive_pass "non-Bash tool" "echo not-bash"

echo ""
echo "[archive-not-delete] non-Bash tools ignored"
EDIT_INPUT='{"tool_name":"Edit","tool_input":{"file_path":"/tmp/test.js"}}'
RESULT=$(node -e "
  var m = require('$ARCHIVE_MOD');
  var r = m($EDIT_INPUT);
  console.log(r === null ? 'pass' : 'block');
" 2>/dev/null)
if [ "$RESULT" = "pass" ]; then
  pass "archive-not-delete ignores Edit tool"
else
  fail "archive-not-delete should ignore Edit tool"
fi

# ============================================================
# config-sync: stale lock detection + branch-aware push
# ============================================================

CONFIG_SYNC_MOD="$HOME/.claude/hooks/run-modules/SessionStart/config-sync.js"
# Resolve to Windows path for Node.js readFileSync
CONFIG_SYNC_WIN=$(cd "$(dirname "$CONFIG_SYNC_MOD")" && (pwd -W 2>/dev/null || pwd))/$(basename "$CONFIG_SYNC_MOD")

echo ""
echo "[config-sync] module structure"

# Verify stale lock handling code exists
if node -e "
  var src = require('fs').readFileSync('$CONFIG_SYNC_WIN', 'utf-8');
  if (src.indexOf('index.lock') === -1) process.exit(1);
  if (src.indexOf('unlinkSync') === -1) process.exit(1);
" 2>/dev/null; then
  pass "config-sync has stale lock removal logic"
else
  fail "config-sync missing stale lock removal logic"
fi

# Verify branch-aware push (no hardcoded 'main')
if node -e "
  var src = require('fs').readFileSync('$CONFIG_SYNC_WIN', 'utf-8');
  if (src.indexOf('git push origin main') !== -1) process.exit(1);
  if (src.indexOf('rev-parse --abbrev-ref HEAD') === -1) process.exit(1);
" 2>/dev/null; then
  pass "config-sync pushes current branch (not hardcoded main)"
else
  fail "config-sync still has hardcoded 'main' push"
fi

# Verify 60s threshold for stale lock
if node -e "
  var src = require('fs').readFileSync('$CONFIG_SYNC_WIN', 'utf-8');
  if (src.indexOf('60000') === -1) process.exit(1);
" 2>/dev/null; then
  pass "config-sync uses 60s stale lock threshold"
else
  fail "config-sync missing 60s stale lock threshold"
fi

# ============================================================
# Summary
# ============================================================

echo ""
echo "========================"
echo "$PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
