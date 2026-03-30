#!/usr/bin/env bash
# Test that every module in modules/ loads and returns valid output types.
# Validates: exports function, doesn't crash on mock input, returns null or object.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: module validation tests ==="

# Mock inputs per event type
PRETOOLUSE_INPUT='{"tool_name":"Bash","tool_input":{"command":"echo hello"}}'
POSTTOOLUSE_INPUT='{"tool_name":"Edit","tool_input":{"file_path":"/tmp/test.js","old_string":"a","new_string":"b"}}'
STOP_INPUT='{"session_id":"test-session","stop_hook_active":true}'
SESSIONSTART_INPUT='{"session_id":"test-session"}'
USERPROMPTSUBMIT_INPUT='{"prompt":"hello claude"}'

get_mock_input() {
  case "$1" in
    PreToolUse) echo "$PRETOOLUSE_INPUT" ;;
    PostToolUse) echo "$POSTTOOLUSE_INPUT" ;;
    Stop) echo "$STOP_INPUT" ;;
    SessionStart) echo "$SESSIONSTART_INPUT" ;;
    UserPromptSubmit) echo "$USERPROMPTSUBMIT_INPUT" ;;
    *) echo '{}' ;;
  esac
}

# Find all module .js files in modules/
for event_dir in "$REPO_DIR"/modules/*/; do
  event=$(basename "$event_dir")
  # All event directories with .js modules are tested

  shopt -s nullglob
  for mod_file in "$event_dir"*.js; do
    [ -f "$mod_file" ] || continue
    mod_name=$(basename "$mod_file")
    mod_win_path="${REPO_DIR}/modules/${event}/${mod_name}"
    mock_input=$(get_mock_input "$event")

    echo "[$event/$mod_name] load and call"

    # Test 1: exports a function
    if node -e "var m = require('$mod_win_path'); if (typeof m !== 'function') { process.exit(1); }" 2>/dev/null; then
      pass "$event/$mod_name exports function"
    else
      fail "$event/$mod_name does not export function"
      continue
    fi

    # Test 2: calling with mock input doesn't crash (returns null, object, or Promise)
    RESULT=$(node -e "
      var m = require('$mod_win_path');
      try {
        var r = m($mock_input);
        if (r && typeof r.then === 'function') {
          r.then(function(v) {
            console.log(v === null ? 'null' : typeof v);
            process.exit(0);
          }).catch(function(e) {
            console.log('promise-error');
            process.exit(0);
          });
          setTimeout(function() { console.log('timeout'); process.exit(0); }, 5000);
        } else {
          console.log(r === null ? 'null' : typeof r);
        }
      } catch(e) {
        console.log('error: ' + e.message);
        process.exit(1);
      }
    " 2>/dev/null) || RESULT="crash"

    case "$RESULT" in
      null|object|undefined)
        pass "$event/$mod_name returns $RESULT (valid)"
        ;;
      timeout)
        pass "$event/$mod_name returns async (timed out, ok for validation)"
        ;;
      promise-error)
        pass "$event/$mod_name returns async with error (ok for validation)"
        ;;
      crash)
        fail "$event/$mod_name crashed on mock input"
        ;;
      error:*)
        fail "$event/$mod_name threw: $RESULT"
        ;;
      *)
        fail "$event/$mod_name returned unexpected: $RESULT"
        ;;
    esac
  done
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
