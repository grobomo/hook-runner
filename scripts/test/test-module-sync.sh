#!/usr/bin/env bash
# Test: module catalog + sync functionality
set -e
cd "$(dirname "$0")/../.."
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== hook-runner: module sync tests ==="

# [1] modules/ directory exists with expected structure
echo "[1] modules/ directory structure"
for dir in modules/PreToolUse modules/PostToolUse modules/Stop modules/SessionStart; do
  [ -d "$dir" ] && pass "$dir exists" || fail "$dir missing"
done

# [2] All modules export functions
echo "[2] All catalog modules export functions"
node -e "
var fs = require('fs'), path = require('path');
var dirs = ['modules/PreToolUse', 'modules/PostToolUse', 'modules/Stop', 'modules/SessionStart', 'modules/PreToolUse/_example-project'];
var ok = 0, fail = 0;
dirs.forEach(function(d) {
  if (!fs.existsSync(d)) return;
  fs.readdirSync(d).filter(function(f) { return f.endsWith('.js'); }).forEach(function(f) {
    try {
      var m = require(path.resolve(d, f));
      if (typeof m === 'function') ok++; else { console.log('NOT_FUNC:' + d + '/' + f); fail++; }
    } catch(e) { console.log('ERROR:' + d + '/' + f + ':' + e.message); fail++; }
  });
});
console.log(ok + ':' + fail);
process.exit(fail > 0 ? 1 : 0);
" > /tmp/modcheck.txt 2>&1
RESULT=$(tail -1 /tmp/modcheck.txt)
MOD_OK=$(echo "$RESULT" | cut -d: -f1)
MOD_FAIL=$(echo "$RESULT" | cut -d: -f2)
[ "$MOD_FAIL" = "0" ] && pass "$MOD_OK modules load correctly" || fail "$MOD_FAIL modules failed to load"

# [3] modules.example.yaml exists and parses correctly
echo "[3] modules.example.yaml parses"
node -e "
var setup = require('./setup.js');
var yaml = require('fs').readFileSync('modules.example.yaml', 'utf-8');
var config = setup.parseModulesYaml(yaml);
if (config.source !== 'grobomo/hook-runner') { console.log('bad source'); process.exit(1); }
if (config.branch !== 'main') { console.log('bad branch'); process.exit(1); }
var events = Object.keys(config.modules);
if (events.length < 4) { console.log('too few events: ' + events.length); process.exit(1); }
var total = 0;
events.forEach(function(e) { total += config.modules[e].length; });
console.log(total + ' modules across ' + events.length + ' events');
" > /tmp/yamlcheck.txt 2>&1 && pass "$(cat /tmp/yamlcheck.txt)" || fail "YAML parse failed: $(cat /tmp/yamlcheck.txt)"

# [4] parseModulesYaml handles project_modules
echo "[4] project_modules parsing"
node -e "
var setup = require('./setup.js');
var yaml = 'source: test/repo\nbranch: dev\nmodules:\n  PreToolUse:\n    - foo\nproject_modules:\n  my-proj:\n    PreToolUse:\n      - bar\n';
var config = setup.parseModulesYaml(yaml);
if (config.source !== 'test/repo') process.exit(1);
if (config.branch !== 'dev') process.exit(1);
if (!config.modules.PreToolUse || config.modules.PreToolUse[0] !== 'foo') process.exit(1);
if (!config.project_modules['my-proj'] || !config.project_modules['my-proj'].PreToolUse) process.exit(1);
if (config.project_modules['my-proj'].PreToolUse[0] !== 'bar') process.exit(1);
console.log('ok');
" > /tmp/projcheck.txt 2>&1 && pass "project_modules parsed correctly" || fail "project_modules parse failed"

# [5] --sync --dry-run doesn't crash (even without modules.yaml)
echo "[5] --sync --dry-run runs without error"
node setup.js --sync --dry-run > /tmp/synctest.txt 2>&1 && pass "--sync --dry-run exits 0" || fail "--sync --dry-run failed"

# [6] Existing tests still pass
echo "[6] Existing tests"
bash scripts/test/test-runners.sh > /tmp/runners.txt 2>&1 && pass "runner tests pass" || fail "runner tests failed"
bash scripts/test/test-setup-wizard.sh > /tmp/wizard.txt 2>&1 && pass "setup wizard tests pass" || fail "setup wizard tests failed"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
