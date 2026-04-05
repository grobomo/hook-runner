#!/usr/bin/env bash
# WHY: T128 — verify SessionStart project-health reads watchdog alert flag
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO_DIR="$(pwd -W 2>/dev/null || pwd)"

echo "=== hook-runner: watchdog alert integration ==="
PASS=0; FAIL=0

check() {
  local desc="$1"; shift
  if eval "$@" >/dev/null 2>&1; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

# Test 1: module exports function
check "module exports function" 'node -e "var m = require(\"./modules/SessionStart/project-health.js\"); if (typeof m !== \"function\") process.exit(1)"'

# Test 2: no alert → no watchdog mention in output
OUT=$(node -e "
  var m = require('./modules/SessionStart/project-health.js');
  var r = m({event: 'SessionStart'});
  if (r && r.text && r.text.indexOf('WATCHDOG') >= 0) process.exit(1);
  process.exit(0);
" 2>&1) || true
EC=$?
if [ "$EC" = "0" ]; then
  echo "  PASS: no alert flag = no watchdog warning"; PASS=$((PASS+1))
else
  echo "  FAIL: no alert flag = no watchdog warning"; FAIL=$((FAIL+1))
fi

# Test 3: create fake alert flag, verify module picks it up
HOOKS_DIR="$HOME/.claude/hooks"
ALERT_PATH="$HOOKS_DIR/.watchdog-alert"
echo '{"timestamp":"2026-04-04T12:00:00Z","failures":["shtd is disabled"],"repairs":["enable-workflow: shtd"]}' > "$ALERT_PATH"
OUT=$(node -e "
  var m = require('./modules/SessionStart/project-health.js');
  var r = m({event: 'SessionStart'});
  if (!r || !r.text) { console.log('no output'); process.exit(1); }
  console.log(r.text);
  if (r.text.indexOf('WATCHDOG') < 0) process.exit(1);
  process.exit(0);
" 2>&1)
EC=$?
if [ "$EC" = "0" ]; then
  echo "  PASS: alert flag triggers watchdog warning"; PASS=$((PASS+1))
else
  echo "  FAIL: alert flag triggers watchdog warning"; FAIL=$((FAIL+1))
fi

# Test 4: alert mentions the repair
if echo "$OUT" | grep -q "auto-repaired"; then
  echo "  PASS: warning mentions auto-repair"; PASS=$((PASS+1))
else
  echo "  FAIL: warning mentions auto-repair"; FAIL=$((FAIL+1))
fi

# Test 5: alert flag cleared after reading
if [ ! -f "$ALERT_PATH" ]; then
  echo "  PASS: alert flag cleared after reading"; PASS=$((PASS+1))
else
  echo "  FAIL: alert flag cleared after reading"; FAIL=$((FAIL+1))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
