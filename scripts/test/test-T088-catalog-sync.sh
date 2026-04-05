#!/usr/bin/env bash
# T088: Verify catalog structure is valid (modules exist per event type)
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: catalog sync validation ==="

# Verify catalog has modules in each event directory
for evt in PreToolUse PostToolUse SessionStart Stop UserPromptSubmit; do
  dir="$REPO_DIR/modules/$evt"
  if [ -d "$dir" ]; then
    count=$(find "$dir" -name "*.js" | wc -l)
    if [ "$count" -gt 0 ]; then
      pass "$evt has $count module(s)"
    else
      fail "$evt directory empty"
    fi
  else
    fail "$evt directory missing"
  fi
done

# Verify all catalog modules load in a single Node process (fast)
LOAD_RESULT=$(node -e "
var fs = require('fs'), path = require('path');
var base = process.argv[1];
var events = ['PreToolUse','PostToolUse','SessionStart','Stop','UserPromptSubmit'];
var ok = 0, bad = 0;
events.forEach(function(evt) {
  var dir = path.join(base, 'modules', evt);
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(function(f) {
    var fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) {
      fs.readdirSync(fp).filter(function(s){return s.endsWith('.js');}).forEach(function(s) {
        try { require(path.join(fp, s)); ok++; } catch(e) { bad++; console.error(evt+'/'+f+'/'+s+': '+e.message); }
      });
    } else if (f.endsWith('.js')) {
      try { require(fp); ok++; } catch(e) { bad++; console.error(evt+'/'+f+': '+e.message); }
    }
  });
});
console.log(ok + ' loaded, ' + bad + ' failed');
process.exit(bad > 0 ? 1 : 0);
" "$REPO_DIR" 2>&1)

if echo "$LOAD_RESULT" | grep -q "0 failed"; then
  COUNT=$(echo "$LOAD_RESULT" | grep -o '[0-9][0-9]* loaded')
  pass "all catalog modules load ($COUNT)"
else
  fail "some modules failed to load: $LOAD_RESULT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
