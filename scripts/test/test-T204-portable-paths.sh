#!/usr/bin/env bash
# WHY: T204 — verify no hardcoded user paths in distributable modules.
# CI secret-scan catches these on push, but this test catches them locally before commit.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== hook-runner: portable paths ==="
PASS=0; FAIL=0

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"; FAIL=$((FAIL+1))
  fi
}

# Check all module .js files for hardcoded user paths
# Exclude: test fixtures, project-scoped modules (they're user-specific by design)
HITS=$(grep -rn \
  -E 'C:\\Users\\[a-zA-Z]+\\|C:/Users/[a-zA-Z]+/' \
  modules/PreToolUse/*.js \
  modules/PostToolUse/*.js \
  modules/Stop/*.js \
  modules/SessionStart/*.js \
  modules/UserPromptSubmit/*.js \
  setup.js report.js load-modules.js workflow.js \
  run-pretooluse.js run-posttooluse.js run-stop.js run-sessionstart.js run-userpromptsubmit.js \
  2>/dev/null || true)

if [ -z "$HITS" ]; then
  assert "no hardcoded user paths in global modules" "0" "0"
else
  echo "  Found hardcoded paths:"
  echo "$HITS" | head -20
  assert "no hardcoded user paths in global modules" "0" "1"
fi

# Check for hardcoded GitHub usernames (PII)
GHITS=$(grep -rn \
  -E 'joel-ginsberg|tmemu|joelg' \
  modules/PreToolUse/*.js \
  modules/PostToolUse/*.js \
  modules/Stop/*.js \
  modules/SessionStart/*.js \
  modules/UserPromptSubmit/*.js \
  setup.js report.js load-modules.js workflow.js \
  run-pretooluse.js run-posttooluse.js run-stop.js run-sessionstart.js run-userpromptsubmit.js \
  2>/dev/null || true)

if [ -z "$GHITS" ]; then
  assert "no hardcoded GitHub usernames in distributable files" "0" "0"
else
  echo "  Found hardcoded usernames:"
  echo "$GHITS" | head -20
  assert "no hardcoded GitHub usernames in distributable files" "0" "1"
fi

# Check for hardcoded ProjectsCL1 references (user-specific directory name)
PHITS=$(grep -rn \
  'ProjectsCL1' \
  modules/PreToolUse/*.js \
  modules/PostToolUse/*.js \
  modules/Stop/*.js \
  modules/SessionStart/*.js \
  modules/UserPromptSubmit/*.js \
  setup.js report.js load-modules.js workflow.js \
  run-pretooluse.js run-posttooluse.js run-stop.js run-sessionstart.js run-userpromptsubmit.js \
  2>/dev/null || true)

if [ -z "$PHITS" ]; then
  assert "no hardcoded ProjectsCL1 references" "0" "0"
else
  echo "  Found ProjectsCL1 references:"
  echo "$PHITS" | head -20
  assert "no hardcoded ProjectsCL1 references" "0" "1"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
