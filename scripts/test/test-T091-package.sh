#!/usr/bin/env bash
# Test T091: package.json validity
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: package.json validation ==="

# Test: package.json exists and is valid JSON
if [ -f "$REPO_DIR/package.json" ]; then
  if node -e "JSON.parse(require('fs').readFileSync('$REPO_DIR/package.json','utf8'))" 2>/dev/null; then
    pass "package.json is valid JSON"
  else
    fail "package.json is invalid JSON"
  fi
else
  fail "package.json missing"
fi

# Test: bin field points to setup.js
result=$(node -e "
var p = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
console.log(p.bin && p.bin['hook-runner'] === 'setup.js' ? 'OK' : 'MISSING');
" "$REPO_DIR/package.json" 2>&1)
if [ "$result" = "OK" ]; then
  pass "bin.hook-runner points to setup.js"
else
  fail "bin field incorrect: $result"
fi

# Test: no dependencies (zero-dep project)
result=$(node -e "
var p = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
var deps = Object.keys(p.dependencies || {}).length;
console.log(deps === 0 ? 'OK' : deps);
" "$REPO_DIR/package.json" 2>&1)
if [ "$result" = "OK" ]; then
  pass "zero dependencies"
else
  fail "unexpected dependencies: $result"
fi

# Test: files field includes core files
result=$(node -e "
var p = JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
var f = p.files || [];
var needed = ['setup.js','report.js','workflow.js','load-modules.js','hook-log.js','run-async.js','modules/','workflows/'];
var missing = needed.filter(function(n){ return f.indexOf(n) === -1; });
console.log(missing.length === 0 ? 'OK' : 'MISSING:' + missing.join(','));
" "$REPO_DIR/package.json" 2>&1)
if [ "$result" = "OK" ]; then
  pass "files field includes all core files"
else
  fail "files field: $result"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
