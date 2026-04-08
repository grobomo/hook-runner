#!/usr/bin/env bash
# Test T376: Stop runner runs ALL modules even when one blocks early
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: Stop runner run-all (T376) ==="

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Create a fake Stop modules directory with 3 modules:
# - mod-a: blocks (like auto-continue)
# - mod-b: passes (observational)
# - mod-c: passes (observational)
# All 3 write to a tracking file so we can verify they all ran.
MODS_DIR="$TMPDIR/run-modules/Stop"
mkdir -p "$MODS_DIR"

cat > "$MODS_DIR/mod-a-blocker.js" <<'JSEOF'
var fs = require("fs");
var path = require("path");
module.exports = function(input) {
  fs.appendFileSync(process.env.T376_TRACK_FILE, "mod-a\n");
  return { decision: "block", reason: "auto-continue" };
};
JSEOF

cat > "$MODS_DIR/mod-b-observer.js" <<'JSEOF'
var fs = require("fs");
module.exports = function(input) {
  fs.appendFileSync(process.env.T376_TRACK_FILE, "mod-b\n");
  return null;
};
JSEOF

cat > "$MODS_DIR/mod-c-observer.js" <<'JSEOF'
var fs = require("fs");
module.exports = function(input) {
  fs.appendFileSync(process.env.T376_TRACK_FILE, "mod-c\n");
  return null;
};
JSEOF

# Convert paths for Node on Windows
MODS_DIR_WIN=$(cd "$MODS_DIR" && (pwd -W 2>/dev/null || pwd))
TMPDIR_WIN=$(cd "$TMPDIR" && (pwd -W 2>/dev/null || pwd))

# Create a test script that simulates the Stop runner logic
cat > "$TMPDIR/test-stop.js" <<JSEOF
var path = require("path");
var fs = require("fs");
var runAsync = require("$REPO_DIR/run-async");

var modsDir = "$MODS_DIR_WIN".replace(/\\\\/g, "/");
var mods = fs.readdirSync(modsDir)
  .filter(function(f) { return f.endsWith(".js"); })
  .sort()
  .map(function(f) { return path.join(modsDir, f); });

var input = { stop_hook_active: false };
var firstBlock = null;
var results = [];

runAsync.runModules(mods, input,
  function handleResult(modName, result, err, ms) {
    results.push({ name: modName, result: result, err: err });
    if (result && result.decision === "block") {
      if (!firstBlock) firstBlock = result;
      return false; // T376: continue running
    }
    return false;
  },
  function handleDone() {
    // Output results as JSON for test verification
    console.log(JSON.stringify({
      modulesRan: results.length,
      firstBlock: firstBlock,
      names: results.map(function(r) { return r.name; })
    }));
  }
);
JSEOF

# 1. All 3 modules run even though mod-a blocks
TRACK_FILE="$TMPDIR_WIN/ran.txt"
rm -f "$TMPDIR/ran.txt"
OUTPUT=$(T376_TRACK_FILE="$TRACK_FILE" node "$TMPDIR/test-stop.js" 2>&1)
MODULES_RAN=$(echo "$OUTPUT" | node -e "var d=JSON.parse(require('fs').readFileSync(0,'utf-8'));console.log(d.modulesRan)")
if [ "$MODULES_RAN" = "3" ]; then
  pass "All 3 modules ran (not short-circuited by block)"
else
  fail "Expected 3 modules ran, got: $MODULES_RAN"
fi

# 2. First block is captured
HAS_BLOCK=$(echo "$OUTPUT" | node -e "var d=JSON.parse(require('fs').readFileSync(0,'utf-8'));console.log(d.firstBlock?'yes':'no')")
if [ "$HAS_BLOCK" = "yes" ]; then
  pass "First block result captured"
else
  fail "First block not captured: $OUTPUT"
fi

# 3. Module execution order preserved
NAMES=$(echo "$OUTPUT" | node -e "var d=JSON.parse(require('fs').readFileSync(0,'utf-8'));console.log(d.names.join(','))")
if [ "$NAMES" = "mod-a-blocker,mod-b-observer,mod-c-observer" ]; then
  pass "Execution order preserved (a,b,c)"
else
  fail "Unexpected order: $NAMES"
fi

# 4. Tracking file confirms all ran
if [ -f "$TMPDIR/ran.txt" ]; then
  RAN_COUNT=$(wc -l < "$TMPDIR/ran.txt" | tr -d ' ')
  if [ "$RAN_COUNT" = "3" ]; then
    pass "Tracking file confirms 3 modules executed"
  else
    fail "Tracking file has $RAN_COUNT entries, expected 3"
  fi
else
  fail "Tracking file not created"
fi

# 5. Verify actual run-stop.js has the T376 pattern (no process.exit in handleResult)
if grep -q 'if (!firstBlock) firstBlock' "$REPO_DIR/run-stop.js"; then
  pass "run-stop.js uses collect-first-block pattern"
else
  fail "run-stop.js missing collect-first-block pattern"
fi

# 6. Verify run-stop.js outputs block in handleDone (not handleResult)
if grep -q 'function handleDone' "$REPO_DIR/run-stop.js" && grep -A5 'function handleDone' "$REPO_DIR/run-stop.js" | grep -q 'firstBlock'; then
  pass "run-stop.js outputs block in handleDone"
else
  fail "run-stop.js should output block in handleDone"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
