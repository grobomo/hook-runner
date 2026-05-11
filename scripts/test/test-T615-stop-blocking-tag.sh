#!/usr/bin/env bash
# Test T615: BLOCKING tag on Stop gate modules + isBlocking detection
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: Stop BLOCKING tag (T615) ==="

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# --- Section 1: Verify catalog modules have BLOCKING: true ---

# 1. stop-analysis-gate.js has BLOCKING: true
if grep -q '// BLOCKING: true' "$REPO_DIR/modules/Stop/stop-analysis-gate.js"; then
  pass "stop-analysis-gate.js has // BLOCKING: true"
else
  fail "stop-analysis-gate.js missing // BLOCKING: true"
fi

# 2. auto-continue-gate.js has BLOCKING: true
if grep -q '// BLOCKING: true' "$REPO_DIR/modules/Stop/auto-continue-gate.js"; then
  pass "auto-continue-gate.js has // BLOCKING: true"
else
  fail "auto-continue-gate.js missing // BLOCKING: true"
fi

# 3. stop-analysis-gate.js has WHY tag
if grep -q '// WHY:' "$REPO_DIR/modules/Stop/stop-analysis-gate.js"; then
  pass "stop-analysis-gate.js has // WHY: tag"
else
  fail "stop-analysis-gate.js missing // WHY: tag"
fi

# 4. auto-continue-gate.js has WHY tag
if grep -q '// WHY:' "$REPO_DIR/modules/Stop/auto-continue-gate.js"; then
  pass "auto-continue-gate.js has // WHY: tag"
else
  fail "auto-continue-gate.js missing // WHY: tag"
fi

# 5. stop-analysis-gate.js has WORKFLOW tag
if grep -q '// WORKFLOW:' "$REPO_DIR/modules/Stop/stop-analysis-gate.js"; then
  pass "stop-analysis-gate.js has // WORKFLOW: tag"
else
  fail "stop-analysis-gate.js missing // WORKFLOW: tag"
fi

# 6. auto-continue-gate.js has WORKFLOW tag
if grep -q '// WORKFLOW:' "$REPO_DIR/modules/Stop/auto-continue-gate.js"; then
  pass "auto-continue-gate.js has // WORKFLOW: tag"
else
  fail "auto-continue-gate.js missing // WORKFLOW: tag"
fi

# --- Section 2: isBlocking() via parseModuleMeta ---

# Create test modules
cat > "$TMPDIR/blocking-mod.js" <<'EOF'
// WORKFLOW: wsl
// BLOCKING: true
// WHY: test module
module.exports = function(input) { return null; };
EOF

cat > "$TMPDIR/non-blocking-mod.js" <<'EOF'
// WORKFLOW: wsl
// WHY: test module
module.exports = function(input) { return null; };
EOF

cat > "$TMPDIR/blocking-yes.js" <<'EOF'
// BLOCKING: yes
module.exports = function(input) { return null; };
EOF

cat > "$TMPDIR/blocking-1.js" <<'EOF'
// BLOCKING: 1
module.exports = function(input) { return null; };
EOF

cat > "$TMPDIR/blocking-false.js" <<'EOF'
// BLOCKING: false
module.exports = function(input) { return null; };
EOF

cat > "$TMPDIR/blocking-deep.js" <<'EOF'
#!/usr/bin/env node
"use strict";
// WORKFLOW: wsl
// WHY: test
//
// ┌──────────────────────┐
// │ Test header box       │
// └──────────────────────┘
// BLOCKING: true
module.exports = function(input) { return null; };
EOF

TMPDIR_ABS=$(cd "$TMPDIR" && (pwd -W 2>/dev/null || pwd))

# 7. isBlocking returns true for // BLOCKING: true
RESULT=$(node -e "
  var lm = require('$REPO_DIR/load-modules');
  console.log(lm.isBlocking('$TMPDIR_ABS/blocking-mod.js'));
")
if [ "$RESULT" = "true" ]; then
  pass "isBlocking() returns true for BLOCKING: true"
else
  fail "isBlocking() returned '$RESULT' for BLOCKING: true"
fi

# 8. isBlocking returns false for module without BLOCKING tag
RESULT=$(node -e "
  var lm = require('$REPO_DIR/load-modules');
  console.log(lm.isBlocking('$TMPDIR_ABS/non-blocking-mod.js'));
")
if [ "$RESULT" = "false" ]; then
  pass "isBlocking() returns false for module without BLOCKING tag"
else
  fail "isBlocking() returned '$RESULT' for module without BLOCKING tag"
fi

# 9. isBlocking accepts BLOCKING: yes
RESULT=$(node -e "
  var lm = require('$REPO_DIR/load-modules');
  console.log(lm.isBlocking('$TMPDIR_ABS/blocking-yes.js'));
")
if [ "$RESULT" = "true" ]; then
  pass "isBlocking() accepts BLOCKING: yes"
else
  fail "isBlocking() returned '$RESULT' for BLOCKING: yes"
fi

# 10. isBlocking accepts BLOCKING: 1
RESULT=$(node -e "
  var lm = require('$REPO_DIR/load-modules');
  console.log(lm.isBlocking('$TMPDIR_ABS/blocking-1.js'));
")
if [ "$RESULT" = "true" ]; then
  pass "isBlocking() accepts BLOCKING: 1"
else
  fail "isBlocking() returned '$RESULT' for BLOCKING: 1"
fi

# 11. isBlocking ignores BLOCKING: false
RESULT=$(node -e "
  var lm = require('$REPO_DIR/load-modules');
  console.log(lm.isBlocking('$TMPDIR_ABS/blocking-false.js'));
")
if [ "$RESULT" = "false" ]; then
  pass "isBlocking() returns false for BLOCKING: false"
else
  fail "isBlocking() returned '$RESULT' for BLOCKING: false"
fi

# 12. isBlocking finds tag deep in header block (past line 8)
RESULT=$(node -e "
  var lm = require('$REPO_DIR/load-modules');
  console.log(lm.isBlocking('$TMPDIR_ABS/blocking-deep.js'));
")
if [ "$RESULT" = "true" ]; then
  pass "isBlocking() finds BLOCKING tag deep in header (line 9+)"
else
  fail "isBlocking() missed deep BLOCKING tag (getHeaderLines scans full header)"
fi

# --- Section 3: parseModuleMeta returns blocking in structured output ---

# 13. parseModuleMeta returns blocking: true
RESULT=$(node -e "
  var lm = require('$REPO_DIR/load-modules');
  var meta = lm.parseModuleMeta('$TMPDIR_ABS/blocking-mod.js');
  console.log(JSON.stringify(meta));
")
META_BLOCKING=$(echo "$RESULT" | node -e "
  var meta = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
  console.log(meta.blocking === true ? 'true' : 'false');
")
if [ "$META_BLOCKING" = "true" ]; then
  pass "parseModuleMeta returns blocking: true"
else
  fail "parseModuleMeta returned blocking: $META_BLOCKING"
fi

# 14. parseModuleMeta returns blocking: false for non-blocking module
META_BLOCKING=$(node -e "
  var lm = require('$REPO_DIR/load-modules');
  var meta = lm.parseModuleMeta('$TMPDIR_ABS/non-blocking-mod.js');
  console.log(meta.blocking);
")
if [ "$META_BLOCKING" = "false" ]; then
  pass "parseModuleMeta returns blocking: false for non-blocking module"
else
  fail "parseModuleMeta returned blocking: $META_BLOCKING for non-blocking module"
fi

# --- Section 4: run-stop.js uses isBlocking ---

# 15. run-stop.js calls loadModules.isBlocking
if grep -q 'loadModules.isBlocking\|isBlocking' "$REPO_DIR/run-stop.js"; then
  pass "run-stop.js uses isBlocking() for routing"
else
  fail "run-stop.js missing isBlocking() check"
fi

# 16. run-stop.js has LEGACY_BLOCKING fallback
if grep -q 'LEGACY_BLOCKING' "$REPO_DIR/run-stop.js"; then
  pass "run-stop.js has LEGACY_BLOCKING fallback for older modules"
else
  fail "run-stop.js missing LEGACY_BLOCKING fallback"
fi

# 17. run-stop.js collects ALL blocks (not just first)
if grep -q 'blocks.push\|blocks\[' "$REPO_DIR/run-stop.js"; then
  pass "run-stop.js collects all blocking results"
else
  fail "run-stop.js only keeps first block (T641 regression)"
fi

# 18. run-stop.js writes analysis file
if grep -q 'stop-analysis.md' "$REPO_DIR/run-stop.js"; then
  pass "run-stop.js writes stop-analysis.md for TUI visibility"
else
  fail "run-stop.js missing analysis file write"
fi

# 19. run-stop.js outputs to stderr for TUI
if grep -q 'process.stderr.write' "$REPO_DIR/run-stop.js"; then
  pass "run-stop.js writes to stderr for TUI visibility"
else
  fail "run-stop.js missing stderr output"
fi

# --- Section 5: Integration — BLOCKING module runs sync, non-blocking deferred ---

MODS_DIR="$TMPDIR/stop-mods"
mkdir -p "$MODS_DIR"

cat > "$MODS_DIR/aaa-blocker.js" <<'EOF'
// BLOCKING: true
var fs = require("fs");
module.exports = function(input) {
  fs.appendFileSync(process.env.T615_TRACK, "blocker:sync\n");
  return { decision: "block", reason: "test block" };
};
EOF

cat > "$MODS_DIR/zzz-observer.js" <<'EOF'
// WHY: test observer
var fs = require("fs");
module.exports = function(input) {
  fs.appendFileSync(process.env.T615_TRACK, "observer:sync\n");
  return null;
};
EOF

MODS_DIR_ABS=$(cd "$MODS_DIR" && (pwd -W 2>/dev/null || pwd))
TRACK="$TMPDIR_ABS/track.txt"
rm -f "$TMPDIR/track.txt"

# 20. BLOCKING module runs, non-blocking goes to background
COUNTS=$(node -e "
  var loadModules = require('$REPO_DIR/load-modules');
  var modPaths = loadModules('$MODS_DIR_ABS');
  var blocking = modPaths.filter(function(p) { return loadModules.isBlocking(p); });
  var nonBlocking = modPaths.filter(function(p) { return !loadModules.isBlocking(p); });
  console.log('blocking:' + blocking.length + ',non:' + nonBlocking.length);
")
if [ "$COUNTS" = "blocking:1,non:1" ]; then
  pass "Module routing: 1 blocking, 1 non-blocking"
else
  fail "Module routing unexpected: $COUNTS"
fi

# T617: Verify bestBlock preference for stop-analysis-gate
if grep -q 'stop-analysis-gate.*bestBlock.*break' "$REPO_DIR/run-stop.js"; then
  pass "T617: run-stop.js prefers stop-analysis-gate output"
else
  fail "T617: run-stop.js should prefer stop-analysis-gate for bestBlock"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
