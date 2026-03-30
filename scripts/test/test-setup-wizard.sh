#!/usr/bin/env bash
# Test setup.js wizard in dry-run mode
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd -W)"  # Windows path for node
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: setup wizard tests ==="

# Test 1: setup.js exists and loads
echo "[1] setup.js loads without error"
node -e "require('$REPO_DIR/setup.js')" 2>/dev/null && pass "setup.js loads" || fail "setup.js load error"

# Test 2: scanHooks returns valid structure
echo "[2] scanHooks returns valid structure"
RESULT=$(node -e "
var s = require('$REPO_DIR/setup.js');
var scan = s.scanHooks();
if (typeof scan.events !== 'object') throw new Error('no events');
if (typeof scan.totalHooks !== 'number') throw new Error('no totalHooks');
if (!Array.isArray(scan.scripts)) throw new Error('no scripts');
console.log('events=' + Object.keys(scan.events).length + ' hooks=' + scan.totalHooks);
" 2>/dev/null)
if [ $? -eq 0 ]; then pass "scanHooks: $RESULT"; else fail "scanHooks error"; fi

# Test 3: generateReport creates HTML file
echo "[3] generateReport creates HTML"
TMPDIR=$(mktemp -d)
REPORT_PATH="$REPO_DIR/test-report-tmp.html"
node -e "
var s = require('$REPO_DIR/setup.js');
var scan = s.scanHooks();
var p = s.generateReport(scan, '$REPORT_PATH');
console.log(p);
" 2>/dev/null
if [ -f "$REPO_DIR/test-report-tmp.html" ]; then
  SIZE=$(wc -c < "$REPO_DIR/test-report-tmp.html")
  pass "report generated ($SIZE bytes)"
  rm -f "$REPO_DIR/test-report-tmp.html"
else
  fail "report not created"
fi

# Test 4: dry-run mode runs without error
echo "[4] --dry-run runs without modifying settings"
# Capture settings.json before
BEFORE=$(md5sum ~/.claude/settings.json 2>/dev/null | cut -d' ' -f1)
node "$REPO_DIR/setup.js" --dry-run 2>/dev/null | tail -1
AFTER=$(md5sum ~/.claude/settings.json 2>/dev/null | cut -d' ' -f1)
if [ "$BEFORE" = "$AFTER" ]; then pass "dry-run didn't modify settings"; else fail "dry-run modified settings!"; fi

# Test 5: SKILL.md exists with required fields
echo "[5] SKILL.md has required fields"
BASH_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
if grep -q "custom_commands" "$BASH_DIR/SKILL.md" && grep -q "hook-runner" "$BASH_DIR/SKILL.md"; then
  pass "SKILL.md has custom_commands and name"
else
  fail "SKILL.md missing fields"
fi

# Test 6: installRunners dry-run returns changes
echo "[6] installRunners dry-run returns changes"
CHANGES=$(node -e "
var s = require('$REPO_DIR/setup.js');
var c = s.installRunners(true);
console.log(c.length);
" 2>/dev/null)
if [ "$CHANGES" -gt 0 ]; then pass "dry-run returned $CHANGES changes"; else fail "no changes returned"; fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
