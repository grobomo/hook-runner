#!/usr/bin/env bash
# T043: Verify LICENSE file exists and repo metadata is correct
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

passed=0
failed=0

pass() { echo "OK: $1"; passed=$((passed + 1)); }
fail() { echo "FAIL: $1"; failed=$((failed + 1)); }

# Test 1: LICENSE file exists
if [ -f "$REPO_DIR/LICENSE" ]; then
  pass "LICENSE file exists"
else
  fail "LICENSE file missing"
fi

# Test 2: LICENSE contains MIT
if grep -q "MIT License" "$REPO_DIR/LICENSE" 2>/dev/null; then
  pass "LICENSE is MIT"
else
  fail "LICENSE does not contain MIT License"
fi

# Test 3: LICENSE contains grobomo (not real name)
if grep -q "grobomo" "$REPO_DIR/LICENSE" 2>/dev/null; then
  pass "LICENSE uses grobomo (anonymous)"
else
  fail "LICENSE missing grobomo attribution"
fi

# Test 4: LICENSE does NOT contain real names
if grep -qiE "(joel|ginsberg|trend.?micro)" "$REPO_DIR/LICENSE" 2>/dev/null; then
  fail "LICENSE contains PII — must be anonymous for grobomo repo"
else
  pass "LICENSE has no PII"
fi

# Test 5: package.json has license field
if node -e "const p=JSON.parse(require('fs').readFileSync(process.argv[1])); process.exit(p.license === 'MIT' ? 0 : 1)" "$REPO_DIR/package.json" 2>/dev/null; then
  pass "package.json license is MIT"
else
  fail "package.json license field missing or not MIT"
fi

echo "  $passed passed, $failed failed"
[ "$failed" -eq 0 ] || exit 1
