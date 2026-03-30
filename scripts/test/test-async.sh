#!/bin/bash
# Test async module support in hook-runner
set -euo pipefail

PASS=0
FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: async module tests ==="

# Setup: create temp module dir with sync + async modules
# Use project-relative dir and convert to Windows path for Node.js compatibility
SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BASH_TMPDIR="$SCRIPT_DIR/.test-async-tmp"
mkdir -p "$BASH_TMPDIR"
trap "rm -rf $BASH_TMPDIR" EXIT

# Node.js on Windows needs C:/... not /c/... paths
if command -v cygpath &>/dev/null; then
  NODE_TMPDIR="$(cygpath -w "$BASH_TMPDIR" | sed 's/\\/\//g')"
else
  NODE_TMPDIR="$BASH_TMPDIR"
fi

MODDIR="$BASH_TMPDIR/run-modules/PreToolUse"
NODE_MODDIR="$NODE_TMPDIR/run-modules/PreToolUse"
mkdir -p "$MODDIR"

# 1. Sync module that passes
cat > "$MODDIR/01-sync-pass.js" << 'MODEOF'
module.exports = function(input) { return null; };
MODEOF

# 2. Async module that passes (resolves null)
cat > "$MODDIR/02-async-pass.js" << 'MODEOF'
module.exports = function(input) {
  return new Promise(function(resolve) {
    setTimeout(function() { resolve(null); }, 50);
  });
};
MODEOF

# 3. Sync module that blocks
cat > "$MODDIR/03-sync-block.js" << 'MODEOF'
module.exports = function(input) {
  return { decision: "block", reason: "sync block test" };
};
MODEOF

echo "[1] run-async.js loads and exports expected functions"
node -e "
var ra = require('./run-async');
if (typeof ra.runModules !== 'function') throw new Error('runModules not a function');
if (typeof ra.isThenable !== 'function') throw new Error('isThenable not a function');
if (typeof ra.withTimeout !== 'function') throw new Error('withTimeout not a function');
" && pass "run-async exports correct functions" || fail "run-async exports"

echo "[2] isThenable detects Promises"
node -e "
var ra = require('./run-async');
if (!ra.isThenable(Promise.resolve(1))) throw new Error('should detect Promise');
if (ra.isThenable(null)) throw new Error('null should not be thenable');
if (ra.isThenable(42)) throw new Error('number should not be thenable');
if (ra.isThenable({decision:'block'})) throw new Error('plain object should not be thenable');
" && pass "isThenable works correctly" || fail "isThenable"

echo "[3] Sync modules still work (pass through)"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"echo hi"}}' | node -e "
var path = require('path');
var runAsync = require('./run-async');
var fs = require('fs');
var input = JSON.parse(fs.readFileSync(0, 'utf-8'));
var mods = ['$NODE_MODDIR/01-sync-pass.js'];
runAsync.runModules(mods, input,
  function(name, result, err) {
    if (err) { console.log('ERROR:' + err.message); return false; }
    if (result && result.decision) { console.log('BLOCK:' + name); return true; }
    console.log('PASS:' + name);
    return false;
  },
  function() { console.log('DONE'); }
);
")
echo "$RESULT" | grep -q "PASS:01-sync-pass" && pass "sync module passes" || fail "sync module pass"
echo "$RESULT" | grep -q "DONE" && pass "done callback fires" || fail "done callback"

echo "[4] Async module resolves and passes"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"echo hi"}}' | node -e "
var path = require('path');
var runAsync = require('./run-async');
var fs = require('fs');
var input = JSON.parse(fs.readFileSync(0, 'utf-8'));
var mods = ['$NODE_MODDIR/02-async-pass.js'];
runAsync.runModules(mods, input,
  function(name, result, err) {
    if (err) { console.log('ERROR:' + err.message); return false; }
    if (result && result.decision) { console.log('BLOCK:' + name); return true; }
    console.log('PASS:' + name);
    return false;
  },
  function() { console.log('DONE'); }
);
")
echo "$RESULT" | grep -q "PASS:02-async-pass" && pass "async module resolves" || fail "async module resolve"
echo "$RESULT" | grep -q "DONE" && pass "done after async" || fail "done after async"

echo "[5] Mixed sync + async + block — block stops iteration"
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"echo hi"}}' | node -e "
var runAsync = require('./run-async');
var fs = require('fs');
var input = JSON.parse(fs.readFileSync(0, 'utf-8'));
var mods = ['$NODE_MODDIR/01-sync-pass.js', '$NODE_MODDIR/02-async-pass.js', '$NODE_MODDIR/03-sync-block.js'];
runAsync.runModules(mods, input,
  function(name, result, err) {
    if (err) { console.log('ERROR:' + name); return false; }
    if (result && result.decision) { console.log('BLOCK:' + name); return true; }
    console.log('PASS:' + name);
    return false;
  },
  function() { console.log('DONE'); }
);
")
echo "$RESULT" | grep -q "PASS:01-sync-pass" && pass "sync runs first" || fail "sync first"
echo "$RESULT" | grep -q "PASS:02-async-pass" && pass "async runs second" || fail "async second"
echo "$RESULT" | grep -q "BLOCK:03-sync-block" && pass "block stops iteration" || fail "block stops"

echo "[6] Async timeout fires for slow modules"
cat > "$MODDIR/99-slow.js" << 'MODEOF'
module.exports = function(input) {
  return new Promise(function(resolve) {
    setTimeout(function() { resolve(null); }, 10000);
  });
};
MODEOF
RESULT=$(echo '{}' | node -e "
var runAsync = require('./run-async');
var fs = require('fs');
var input = JSON.parse(fs.readFileSync(0, 'utf-8'));
var mods = ['$NODE_MODDIR/99-slow.js'];
runAsync.runModules(mods, input,
  function(name, result, err) {
    if (err) { console.log('TIMEOUT:' + name + ':' + err.message); return false; }
    console.log('PASS:' + name);
    return false;
  },
  function() { console.log('DONE'); },
  200  // 200ms timeout for test speed
);
")
echo "$RESULT" | grep -q "TIMEOUT:99-slow" && pass "timeout fires for slow module" || fail "timeout"
echo "$RESULT" | grep -q "DONE" && pass "done after timeout" || fail "done after timeout"

echo "[7] Async module that resolves with a block decision"
cat > "$MODDIR/04-async-block.js" << 'MODEOF'
module.exports = function(input) {
  return new Promise(function(resolve) {
    setTimeout(function() {
      resolve({ decision: "block", reason: "async block test" });
    }, 50);
  });
};
MODEOF
RESULT=$(echo '{"tool_name":"Bash","tool_input":{"command":"test"}}' | node -e "
var runAsync = require('./run-async');
var fs = require('fs');
var input = JSON.parse(fs.readFileSync(0, 'utf-8'));
var mods = ['$NODE_MODDIR/01-sync-pass.js', '$NODE_MODDIR/04-async-block.js', '$NODE_MODDIR/03-sync-block.js'];
var order = [];
runAsync.runModules(mods, input,
  function(name, result, err) {
    if (err) { order.push('ERROR:' + name); return false; }
    if (result && result.decision) { order.push('BLOCK:' + name); console.log(order.join(',')); return true; }
    order.push('PASS:' + name);
    return false;
  },
  function() { console.log(order.join(',')); console.log('DONE'); }
);
")
echo "$RESULT" | grep -q "BLOCK:04-async-block" && pass "async block decision works" || fail "async block"
# 03-sync-block should NOT appear — iteration stopped at async block
echo "$RESULT" | grep -q "03-sync-block" && fail "should not reach module after block" || pass "iteration stopped at async block"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
