#!/usr/bin/env bash
# WHY: T122 — verify watchdog detects disabled workflows, auto-repairs, creates alert flag
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== hook-runner: watchdog ==="
PASS=0; FAIL=0

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"; FAIL=$((FAIL+1))
  fi
}

# Setup: isolated temp dir as fake hooks dir
TMPDIR="$(pwd)/.test-tmp-T122-$$"
mkdir -p "$TMPDIR/run-modules/Stop" "$TMPDIR/run-modules/PreToolUse"
trap 'rm -rf "$TMPDIR"' EXIT

# Create minimal runner files
for r in run-pretooluse.js run-posttooluse.js run-stop.js run-sessionstart.js run-userpromptsubmit.js load-modules.js workflow.js; do
  echo "// stub" > "$TMPDIR/$r"
done

# Create critical modules
echo 'module.exports = function() { return null; };' > "$TMPDIR/run-modules/Stop/auto-continue.js"
echo 'module.exports = function() { return null; };' > "$TMPDIR/run-modules/PreToolUse/branch-pr-gate.js"

# Create watchdog config
cat > "$TMPDIR/watchdog-config.json" << 'JSON'
{
  "required_workflows": ["shtd"],
  "required_runners": ["run-pretooluse.js", "run-posttooluse.js", "run-stop.js", "run-sessionstart.js", "run-userpromptsubmit.js", "load-modules.js", "workflow.js"],
  "required_modules": ["Stop/auto-continue.js", "PreToolUse/branch-pr-gate.js"]
}
JSON

# Test 1: healthy system → exit 0
echo '{"shtd": true}' > "$TMPDIR/workflow-config.json"
EC=0
OUT=$(node watchdog.js --hooks-dir "$TMPDIR" --config "$TMPDIR/watchdog-config.json" 2>&1) || EC=$?
assert "healthy system exits 0" "0" "$EC"
assert "healthy output is JSON" "0" "$(echo "$OUT" | node -e "try{JSON.parse(require('fs').readFileSync(0,'utf-8'));console.log(0)}catch(e){console.log(1)}" 2>/dev/null || echo 1)"

# Test 2: disabled workflow → detected + repaired
echo '{"shtd": false}' > "$TMPDIR/workflow-config.json"
rm -f "$TMPDIR/.watchdog-alert"
EC2=0
OUT2=$(node watchdog.js --hooks-dir "$TMPDIR" --config "$TMPDIR/watchdog-config.json" 2>&1) || EC2=$?
assert "disabled shtd exits 1 (repaired)" "1" "$EC2"

# Test 3: alert flag created
if [ -f "$TMPDIR/.watchdog-alert" ]; then
  assert "alert flag created" "0" "0"
else
  assert "alert flag created" "0" "1"
fi

# Test 4: workflow auto-repaired
REPAIRED=$(node -e "var c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8'));console.log(c.shtd===true?'yes':'no')" "$TMPDIR/workflow-config.json" 2>/dev/null || echo "error")
assert "shtd auto-repaired to true" "yes" "$REPAIRED"

# Test 5: missing runner → detected
rm "$TMPDIR/run-stop.js"
echo '{"shtd": true}' > "$TMPDIR/workflow-config.json"
EC3=0
OUT3=$(node watchdog.js --hooks-dir "$TMPDIR" --config "$TMPDIR/watchdog-config.json" 2>&1) || EC3=$?
assert "missing runner exits 2 (broken)" "2" "$EC3"

# Test 6: log file created
if [ -f "$TMPDIR/watchdog-log.jsonl" ]; then
  assert "log file created" "0" "0"
else
  assert "log file created" "0" "1"
fi

# Test 7: missing config file → uses defaults
rm -f "$TMPDIR/watchdog-config.json"
echo "// stub" > "$TMPDIR/run-stop.js"
echo '{"shtd": true, "code-quality": true, "self-improvement": true, "session-management": true, "messaging-safety": true}' > "$TMPDIR/workflow-config.json"
EC4=0
OUT4=$(node watchdog.js --hooks-dir "$TMPDIR" 2>&1) || EC4=$?
assert "no config file uses defaults" "0" "$EC4"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
