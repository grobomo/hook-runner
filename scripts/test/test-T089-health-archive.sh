#!/usr/bin/env bash
# Test T089: project-health.js skips archive/ directories
set -euo pipefail
PASS=0; FAIL=0

# WHY: cygpath is Windows-only. Use node to resolve the path cross-platform.
HEALTH_MOD="$HOME/.claude/hooks/run-modules/SessionStart/project-health.js"
if [ ! -f "$HEALTH_MOD" ]; then
  echo "SKIP: project-health.js not installed (CI environment)"
  echo "=== Results: 0 passed, 0 failed ==="
  exit 0
fi

# Test: project-health module loads and returns valid type
result=$(node -e "
var m = require(process.argv[1]);
var r = m({});
if (r === null) { console.log('null'); }
else if (r && typeof r.text === 'string') { console.log('text'); }
else { console.log('unexpected: ' + typeof r); process.exit(1); }
" "$HEALTH_MOD" 2>&1) || true

if echo "$result" | grep -qE '^(null|text)$'; then
  echo "PASS: project-health returns valid type ($result)"
  PASS=$((PASS+1))
else
  echo "FAIL: project-health unexpected output: $result"
  FAIL=$((FAIL+1))
fi

# Test: archive modules should NOT appear in health output
health_text=$(node -e "
var m = require(process.argv[1]);
var r = m({});
console.log(r ? r.text : 'NO_ISSUES');
" "$HEALTH_MOD" 2>&1)

if echo "$health_text" | grep -q "archive/"; then
  echo "FAIL: health check still reports archive/ modules"
  FAIL=$((FAIL+1))
else
  echo "PASS: health check does not report archive/ modules"
  PASS=$((PASS+1))
fi

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
