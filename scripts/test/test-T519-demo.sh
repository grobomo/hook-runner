#!/usr/bin/env bash
# Test --demo CLI command
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PASS=0; FAIL=0

check() {
  if [ $? -eq 0 ]; then echo "  PASS: $1"; PASS=$((PASS+1))
  else echo "  FAIL: $1"; FAIL=$((FAIL+1)); fi
}

echo "=== hook-runner: --demo tests ==="

echo "[1] --demo runs via setup.js"
OUT=$(node "$REPO_DIR/setup.js" --demo --fast 2>&1)
echo "$OUT" | grep -q "Interactive Demo" && check "shows demo header" || { echo "  FAIL: no demo header"; FAIL=$((FAIL+1)); }

echo "[2] Shows version"
OUT=$(node "$REPO_DIR/setup.js" --demo --fast 2>&1)
echo "$OUT" | grep -q "hook-runner v" && check "shows version" || { echo "  FAIL: no version"; FAIL=$((FAIL+1)); }

echo "[3] Runs all scenarios"
OUT=$(node "$REPO_DIR/setup.js" --demo --fast 2>&1)
echo "$OUT" | grep -q "Scenario 1" && check "scenario 1 present" || { echo "  FAIL: no scenario 1"; FAIL=$((FAIL+1)); }
echo "$OUT" | grep -q "Scenario 6" && check "scenario 6 present" || { echo "  FAIL: no scenario 6"; FAIL=$((FAIL+1)); }

echo "[4] Shows BLOCKED results"
OUT=$(node "$REPO_DIR/setup.js" --demo --fast 2>&1)
echo "$OUT" | grep -q "BLOCKED" && check "has BLOCKED output" || { echo "  FAIL: no BLOCKED"; FAIL=$((FAIL+1)); }

echo "[5] Shows PASS results"
OUT=$(node "$REPO_DIR/setup.js" --demo --fast 2>&1)
echo "$OUT" | grep -q "PASS" && check "has PASS output" || { echo "  FAIL: no PASS"; FAIL=$((FAIL+1)); }

echo "[6] Shows install instructions"
OUT=$(node "$REPO_DIR/setup.js" --demo --fast 2>&1)
echo "$OUT" | grep -q "npx grobomo/hook-runner" && check "install command shown" || { echo "  FAIL: no install command"; FAIL=$((FAIL+1)); }

echo "[7] demo.js runs standalone"
OUT=$(node "$REPO_DIR/demo.js" --fast 2>&1)
echo "$OUT" | grep -q "Interactive Demo" && check "standalone runs" || { echo "  FAIL: standalone broken"; FAIL=$((FAIL+1)); }

echo "[8] Module counts are non-zero"
OUT=$(node "$REPO_DIR/demo.js" --fast 2>&1)
# Extract module count — expect "NNN modules"
COUNT=$(echo "$OUT" | grep -o '[0-9]* modules' | head -1 | grep -o '[0-9]*')
[ "${COUNT:-0}" -gt 50 ] && check "module count > 50 ($COUNT)" || { echo "  FAIL: module count too low ($COUNT)"; FAIL=$((FAIL+1)); }

echo "[9] --demo in help text"
HELP=$(node "$REPO_DIR/setup.js" --help 2>&1)
echo "$HELP" | grep -q "\-\-demo" && check "--demo in help" || { echo "  FAIL: --demo not in help"; FAIL=$((FAIL+1)); }

echo "[10] Block messages show real module names"
OUT=$(node "$REPO_DIR/demo.js" --fast 2>&1)
echo "$OUT" | grep -q "force-push-gate" && check "force-push-gate mentioned" || { echo "  FAIL: no force-push-gate"; FAIL=$((FAIL+1)); }
echo "$OUT" | grep -q "git-destructive-guard" && check "git-destructive-guard mentioned" || { echo "  FAIL: no git-destructive-guard"; FAIL=$((FAIL+1)); }
echo "$OUT" | grep -q "archive-not-delete" && check "archive-not-delete mentioned" || { echo "  FAIL: no archive-not-delete"; FAIL=$((FAIL+1)); }
echo "$OUT" | grep -q "commit-quality-gate" && check "commit-quality-gate mentioned" || { echo "  FAIL: no commit-quality-gate"; FAIL=$((FAIL+1)); }

echo "[11] --demo-html generates HTML file"
HTML_OUT=$(node "$REPO_DIR/demo.js" --html 2>&1)
# Extract path from output: "Demo HTML written to: <path>"
HTML_FILE=$(echo "$HTML_OUT" | sed -n 's/.*written to: //p' | tr -d '\r')
[ -f "$HTML_FILE" ] && check "--demo-html creates file" || { echo "  FAIL: no HTML file at $HTML_FILE"; FAIL=$((FAIL+1)); }

echo "[12] HTML has correct structure"
if [ -f "$HTML_FILE" ]; then
  grep -q "<!DOCTYPE html>" "$HTML_FILE" && check "has DOCTYPE" || { echo "  FAIL: no DOCTYPE"; FAIL=$((FAIL+1)); }
  grep -q "hook-runner v" "$HTML_FILE" && check "has version" || { echo "  FAIL: no version"; FAIL=$((FAIL+1)); }
  grep -q "Scenario 1" "$HTML_FILE" && check "has scenario 1" || { echo "  FAIL: no scenario 1"; FAIL=$((FAIL+1)); }
  grep -q "Scenario 6" "$HTML_FILE" && check "has scenario 6" || { echo "  FAIL: no scenario 6"; FAIL=$((FAIL+1)); }
  grep -q "force-push-gate" "$HTML_FILE" && check "has module names" || { echo "  FAIL: no module names"; FAIL=$((FAIL+1)); }
  grep -q "BLOCKED" "$HTML_FILE" && check "has BLOCKED text" || { echo "  FAIL: no BLOCKED"; FAIL=$((FAIL+1)); }
  grep -q "Get started" "$HTML_FILE" && check "has get-started" || { echo "  FAIL: no get-started"; FAIL=$((FAIL+1)); }
fi

echo "[13] HTML is self-contained"
if [ -f "$HTML_FILE" ]; then
  ! grep -q 'link.*rel.*stylesheet' "$HTML_FILE" && check "no external CSS" || { echo "  FAIL: external CSS found"; FAIL=$((FAIL+1)); }
  ! grep -q 'script.*src=' "$HTML_FILE" && check "no external JS" || { echo "  FAIL: external JS found"; FAIL=$((FAIL+1)); }
fi

echo "[14] --demo-html in help text"
HELP=$(node "$REPO_DIR/setup.js" --help 2>&1)
echo "$HELP" | grep -q "\-\-demo-html" && check "--demo-html in help" || { echo "  FAIL: --demo-html not in help"; FAIL=$((FAIL+1)); }

echo "[15] --demo-html runs via setup.js"
node "$REPO_DIR/setup.js" --demo-html 2>&1 | grep -q "Demo HTML written" && check "--demo-html via setup.js" || { echo "  FAIL: setup.js --demo-html broken"; FAIL=$((FAIL+1)); }

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
