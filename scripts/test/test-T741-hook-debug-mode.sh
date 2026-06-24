#!/usr/bin/env bash
# T741: Test hook debugging mode
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && (pwd -W 2>/dev/null || pwd))"
DEBUG_MODULE="$PROJECT_DIR/hook-debug.js"
PASS=0; FAIL=0; TOTAL=0

TMPDIR_RAW=$(mktemp -d)
TMPDIR="$(cd "$TMPDIR_RAW" && (pwd -W 2>/dev/null || pwd))"
trap 'rm -rf "$TMPDIR_RAW"' EXIT

mkdir -p "$TMPDIR/.claude/hooks"

run_test() {
  local desc="$1" expected="$2"
  shift 2
  TOTAL=$((TOTAL + 1))
  local result
  result=$("$@" 2>/dev/null) || result="error:$?"
  if [[ "$result" == *"$expected"* ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (expected '$expected', got '${result:0:100}')"
  fi
}

echo "=== T741: Hook Debug Mode Tests ==="

# Test 1: isActive returns false when no flag
run_test "isActive false when no flag" "false" \
  node -e "process.env.HOME='$TMPDIR'; delete require.cache[require.resolve('$DEBUG_MODULE')]; var d = require('$DEBUG_MODULE'); console.log(d.isActive())"

# Test 2: isActive true with HOOK_DEBUG=1
run_test "isActive true with HOOK_DEBUG=1" "true" \
  bash -c "HOOK_DEBUG=1 HOME='$TMPDIR' node -e \"delete require.cache[require.resolve('$DEBUG_MODULE')]; var d = require('$DEBUG_MODULE'); console.log(d.isActive())\""

# Test 3: isActive true with flag file
touch "$TMPDIR/.claude/hooks/.debug-mode"
run_test "isActive true with flag file" "true" \
  node -e "delete require.cache[require.resolve('$DEBUG_MODULE')]; process.env.HOME='$TMPDIR'; var d = require('$DEBUG_MODULE'); console.log(d.isActive())"

# Test 4: writeInput creates file in debug dir
TOTAL=$((TOTAL + 1))
HOOK_DEBUG=1 HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$DEBUG_MODULE')];
  process.env.HOME='$TMPDIR'; process.env.HOOK_DEBUG='1'; process.env.CLAUDE_SESSION_ID='test-1234';
  var d = require('$DEBUG_MODULE');
  d.writeInput('Stop', {last_assistant_message: 'hello world', stop_hook_active: false});
" 2>/dev/null
files=$(ls "$TMPDIR/.claude/hooks/debug/" 2>/dev/null | grep "^Stop-" | wc -l)
if [[ "$files" -ge 1 ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: writeInput creates file in debug dir ($files files)"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: writeInput creates file in debug dir (found $files files)"
fi

# Test 5: traceModuleStart writes to trace.jsonl
TOTAL=$((TOTAL + 1))
HOOK_DEBUG=1 HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$DEBUG_MODULE')];
  process.env.HOME='$TMPDIR'; process.env.HOOK_DEBUG='1'; process.env.CLAUDE_SESSION_ID='test-1234';
  var d = require('$DEBUG_MODULE');
  d.traceModuleStart('Stop', 'auto-continue-gate');
  d.traceModuleEnd('Stop', 'auto-continue-gate', {decision:'block',reason:'test'}, 1234);
  d.traceModuleError('Stop', 'broken-gate', 'syntax error', 5);
" 2>/dev/null
trace_lines=$(wc -l < "$TMPDIR/.claude/hooks/debug/trace.jsonl" 2>/dev/null || echo 0)
if [[ "$trace_lines" -ge 3 ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: traceModuleStart/End/Error write to trace.jsonl ($trace_lines entries)"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: trace entries (expected >= 3, got $trace_lines)"
fi

# Test 6: Trace entry has correct structure
TOTAL=$((TOTAL + 1))
last_line=$(tail -1 "$TMPDIR/.claude/hooks/debug/trace.jsonl" 2>/dev/null)
if echo "$last_line" | node -e "var e=JSON.parse(require('fs').readFileSync(0,'utf-8')); process.exit(e.event==='Stop' && e.module==='broken-gate' && e.phase==='error' && e.error==='syntax error' ? 0 : 1)" 2>/dev/null; then
  PASS=$((PASS + 1))
  echo "  PASS: Trace entry has correct structure (event, module, phase, error)"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Trace entry structure (got: ${last_line:0:100})"
fi

# Test 7: CLI on/off toggle
rm -f "$TMPDIR/.claude/hooks/.debug-mode"
TOTAL=$((TOTAL + 1))
HOME="$TMPDIR" node "$DEBUG_MODULE" on >/dev/null 2>&1
if [[ -f "$TMPDIR/.claude/hooks/.debug-mode" ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: CLI 'on' creates flag file"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: CLI 'on' did not create flag file"
fi

TOTAL=$((TOTAL + 1))
HOME="$TMPDIR" node "$DEBUG_MODULE" off >/dev/null 2>&1
if [[ ! -f "$TMPDIR/.claude/hooks/.debug-mode" ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: CLI 'off' removes flag file"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: CLI 'off' did not remove flag file"
fi

# Test 8: pruneOldFiles removes old entries
TOTAL=$((TOTAL + 1))
touch -d "2020-01-01" "$TMPDIR/.claude/hooks/debug/old-file.json" 2>/dev/null || touch "$TMPDIR/.claude/hooks/debug/old-file.json"
# Make it old by using perl to backdate
perl -e 'utime(0,0,"'"$TMPDIR/.claude/hooks/debug/old-file.json"'")' 2>/dev/null || true
count=$(HOOK_DEBUG=1 HOME="$TMPDIR" node -e "
  delete require.cache[require.resolve('$DEBUG_MODULE')];
  process.env.HOME='$TMPDIR'; process.env.HOOK_DEBUG='1';
  var d = require('$DEBUG_MODULE');
  console.log(d.pruneOldFiles(0));
" 2>/dev/null)
if [[ "$count" -ge 1 ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: pruneOldFiles removes old entries (pruned $count)"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: pruneOldFiles (pruned $count)"
fi

# Test 9: writeInput is no-op when debug mode off
TOTAL=$((TOTAL + 1))
rm -f "$TMPDIR/.claude/hooks/.debug-mode"
rm -rf "$TMPDIR/.claude/hooks/debug2"
TMPDIR2_RAW=$(mktemp -d)
TMPDIR2="$(cd "$TMPDIR2_RAW" && (pwd -W 2>/dev/null || pwd))"
mkdir -p "$TMPDIR2/.claude/hooks"
result=$(HOME="$TMPDIR2" node -e "
  delete require.cache[require.resolve('$DEBUG_MODULE')];
  process.env.HOME='$TMPDIR2';
  delete process.env.HOOK_DEBUG;
  var d = require('$DEBUG_MODULE');
  d.writeInput('Stop', {test: true});
  var fs = require('fs');
  try { var files = fs.readdirSync('$TMPDIR2/.claude/hooks/debug'); console.log(files.length); } catch(e) { console.log('0'); }
" 2>/dev/null)
rm -rf "$TMPDIR2_RAW"
if [[ "$result" == "0" ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: writeInput no-op when debug mode off"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: writeInput should be no-op when off (got $result files)"
fi

# Test 10: setup.js --debug status
TOTAL=$((TOTAL + 1))
result=$(HOME="$TMPDIR" node "$PROJECT_DIR/cli/setup.js" --debug status 2>/dev/null)
if [[ "$result" == *"Debug mode:"* ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: setup.js --debug status works"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: setup.js --debug status (got: ${result:0:80})"
fi

echo ""
echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
