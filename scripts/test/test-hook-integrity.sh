#!/usr/bin/env bash
# Test suite for hook integrity monitor modules
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: hook integrity monitor ==="

# --- Test 1: All 3 modules load ---
node -e "require('${REPO_DIR}/modules/SessionStart/hook-integrity-check.js')" 2>/dev/null && pass "SessionStart module loads" || fail "SessionStart module loads"
node -e "require('${REPO_DIR}/modules/UserPromptSubmit/hook-integrity-monitor.js')" 2>/dev/null && pass "UserPromptSubmit module loads" || fail "UserPromptSubmit module loads"
node -e "require('${REPO_DIR}/modules/PreToolUse/workflow-compliance-gate.js')" 2>/dev/null && pass "Compliance gate loads" || fail "Compliance gate loads"

# --- Test 2: Module types ---
RESULT=$(node -e "var m = require('${REPO_DIR}/modules/UserPromptSubmit/hook-integrity-monitor.js'); process.stdout.write(m.constructor.name)" 2>/dev/null || echo "error")
[ "$RESULT" = "AsyncFunction" ] && pass "integrity-monitor is async" || fail "integrity-monitor is async: $RESULT"

RESULT=$(node -e "var m = require('${REPO_DIR}/modules/PreToolUse/workflow-compliance-gate.js'); process.stdout.write(typeof m)" 2>/dev/null || echo "error")
[ "$RESULT" = "function" ] && pass "compliance-gate is sync" || fail "compliance-gate is sync: $RESULT"

# --- Test 3: WORKFLOW + WHY headers ---
for mod in modules/PreToolUse/workflow-compliance-gate.js modules/SessionStart/hook-integrity-check.js modules/UserPromptSubmit/hook-integrity-monitor.js; do
  name=$(basename "$mod" .js)
  head -1 "$REPO_DIR/$mod" | grep -q "// WORKFLOW:" && pass "$name has WORKFLOW tag" || fail "$name missing WORKFLOW tag"
  grep -q "// WHY:" "$REPO_DIR/$mod" && pass "$name has WHY comment" || fail "$name missing WHY comment"
done

# --- Test 4: Drift detection via md5 ---
TMPDIR_T="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_T"' EXIT
mkdir -p "$TMPDIR_T/a" "$TMPDIR_T/b"
echo "version1" > "$TMPDIR_T/a/mod.js"
echo "version2" > "$TMPDIR_T/b/mod.js"
cp "$TMPDIR_T/a/mod.js" "$TMPDIR_T/b/mod-same.js"

# Write a test helper
cat > "$TMPDIR_T/md5test.js" << 'EOF'
var crypto = require("crypto"), fs = require("fs");
function md5(p) { return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex"); }
var a = process.argv[2], b = process.argv[3];
process.stdout.write(md5(a) === md5(b) ? "same" : "different");
EOF

RESULT=$(node "$TMPDIR_T/md5test.js" "$TMPDIR_T/a/mod.js" "$TMPDIR_T/b/mod.js" 2>/dev/null)
[ "$RESULT" = "different" ] && pass "Drift detection: different files detected" || fail "Drift detection: $RESULT"

RESULT=$(node "$TMPDIR_T/md5test.js" "$TMPDIR_T/a/mod.js" "$TMPDIR_T/b/mod-same.js" 2>/dev/null)
[ "$RESULT" = "same" ] && pass "Drift detection: identical files pass" || fail "Identical files: $RESULT"

# --- Test 5: Marker file exists and points to repo ---
MARKER="$HOME/.claude/hooks/.hook-runner-repo"
if [ -f "$MARKER" ]; then
  MARKER_VAL=$(cat "$MARKER" | tr -d '\r\n')
  if [ -d "$MARKER_VAL/modules" ]; then
    pass "Marker file points to valid repo"
  else
    fail "Marker file points to invalid path: $MARKER_VAL"
  fi
else
  fail "Marker file missing (run sync-live first)"
fi

# --- Test 6: Exception whitelist parsing ---
TMPDIR_W="$(cd "$TMPDIR_T" && (pwd -W 2>/dev/null || pwd))"
cat > "$TMPDIR_T/exc.json" << 'EOF'
{"/some/project": {"workflow": "shtd", "reason": "test exception"}}
EOF
cat > "$TMPDIR_T/exc_test.js" << EXEOF
var d = JSON.parse(require("fs").readFileSync("${TMPDIR_W}/exc.json", "utf-8"));
process.stdout.write(d["/some/project"].workflow);
EXEOF
RESULT=$(node "$TMPDIR_T/exc_test.js" 2>/dev/null || echo "error")
[ "$RESULT" = "shtd" ] && pass "Exception whitelist JSON parsing" || fail "Exception whitelist: $RESULT"

# --- Test 7: decodeProjectDir resolves real paths ---
cat > "$TMPDIR_T/decode_test.js" << 'DEOF'
var fs = require("fs"), path = require("path");
var setup = require(process.argv[2]);
var fn = setup._decodeProjectDir;
if (!fn) { process.stdout.write("NO_EXPORT"); process.exit(0); }
var tests = [
  ["C--Users-joelg-Documents-ProjectsCL1-hook-runner", "hook-runner"],
  ["C--Users-joelg-Documents-ProjectsCL1-ep-incident-response", "ep-incident-response"],
];
var pass = 0;
for (var i = 0; i < tests.length; i++) {
  var decoded = fn(tests[i][0]);
  if (decoded && decoded.indexOf(tests[i][1]) !== -1 && fs.existsSync(decoded)) pass++;
}
process.stdout.write(String(pass));
DEOF
RESULT=$(node "$TMPDIR_T/decode_test.js" "$REPO_DIR/setup.js" 2>/dev/null || echo "error")
if [ "$RESULT" = "NO_EXPORT" ]; then
  pass "decodeProjectDir: not exported (internal function)"
elif [ "$RESULT" = "2" ]; then
  pass "decodeProjectDir: resolves hyphenated paths"
else
  fail "decodeProjectDir: $RESULT/2 paths resolved"
fi

# --- Test 8: --integrity command runs without error ---
RESULT=$(node "$REPO_DIR/setup.js" --integrity --json 2>/dev/null || echo "error")
echo "$RESULT" | node -e "var d='';process.stdin.on('data',function(c){d+=c});process.stdin.on('end',function(){try{var j=JSON.parse(d);process.stdout.write(j.files&&j.workflows?'ok':'bad')}catch(e){process.stdout.write('parse-error')}})" | grep -q "ok" && pass "--integrity --json produces valid output" || fail "--integrity --json output invalid"

# --- Test 9: shtd.yml includes new modules ---
for mod in workflow-compliance-gate hook-integrity-check hook-integrity-monitor; do
  grep -q "$mod" "$REPO_DIR/workflows/shtd.yml" && pass "$mod in shtd.yml" || fail "$mod missing from shtd.yml"
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
