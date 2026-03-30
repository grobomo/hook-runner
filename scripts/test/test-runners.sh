#!/usr/bin/env bash
# Test that hook runners load modules correctly via load-modules.js
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: runner tests ==="

# Test 1: load-modules.js exists and exports a function
echo "[1] load-modules.js exports a function"
node -e "var lm = require('$REPO_DIR/load-modules.js'); if (typeof lm !== 'function') throw new Error('not a function');" 2>/dev/null && pass "load-modules exports function" || fail "load-modules not a function"

# Test 2: load-modules returns array for existing dir
echo "[2] load-modules returns array for run-modules/PreToolUse"
COUNT=$(node -e "var lm = require('$REPO_DIR/load-modules.js'); var r = lm('$REPO_DIR/run-modules/PreToolUse'); console.log(r.length);" 2>/dev/null)
if [ "$COUNT" -gt 0 ]; then pass "found $COUNT PreToolUse modules"; else fail "no modules found"; fi

# Test 3: load-modules returns empty for nonexistent dir
echo "[3] load-modules returns empty for nonexistent dir"
COUNT=$(node -e "var lm = require('$REPO_DIR/load-modules.js'); var r = lm('$REPO_DIR/run-modules/FakeEvent'); console.log(r.length);" 2>/dev/null)
if [ "$COUNT" -eq 0 ]; then pass "empty for fake dir"; else fail "returned $COUNT for fake dir"; fi

# Test 4: Each runner script exists and has shebang
echo "[4] Runner scripts exist with shebang"
BASH_DIR="$(cd "$(dirname "$0")/../.." && pwd)"  # Git Bash path for file ops
for runner in run-pretooluse.js run-posttooluse.js run-stop.js run-sessionstart.js run-userpromptsubmit.js; do
  if [ -f "$BASH_DIR/$runner" ] && head -1 "$BASH_DIR/$runner" | grep -q "#!/usr/bin/env node"; then
    pass "$runner exists with shebang"
  else
    fail "$runner missing or no shebang"
  fi
done

# Test 5: All runners require load-modules
echo "[5] Runners use load-modules.js"
for runner in run-pretooluse.js run-posttooluse.js run-stop.js run-sessionstart.js run-userpromptsubmit.js; do
  if grep -q 'require("./load-modules")' "$BASH_DIR/$runner"; then
    pass "$runner requires load-modules"
  else
    fail "$runner doesn't require load-modules"
  fi
done

# Test 6: Example modules export functions
echo "[6] Example modules export functions"
for mod in run-modules/PreToolUse/enforcement-gate.js run-modules/Stop/auto-continue.js run-modules/PostToolUse/rule-hygiene.js; do
  if [ -f "$BASH_DIR/$mod" ]; then
    node -e "var m = require('$REPO_DIR/$mod'); if (typeof m !== 'function') throw new Error('not a function');" 2>/dev/null && pass "$mod exports function" || fail "$mod not a function"
  else
    fail "$mod not found"
  fi
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
