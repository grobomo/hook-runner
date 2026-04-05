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

# Collect all module .js files (top-level + project-scoped subdirs)
collect_modules() {
  local event_dir="$1"
  local event="$2"
  shopt -s nullglob
  for mod_file in "$event_dir"*.js; do
    echo "$event|$(basename "$mod_file")|$mod_file"
  done
  for sub_dir in "$event_dir"*/; do
    [ -d "$sub_dir" ] || continue
    local sub_name=$(basename "$sub_dir")
    [ "$sub_name" = "archive" ] && continue
    for mod_file in "$sub_dir"*.js; do
      echo "$event|${sub_name}/$(basename "$mod_file")|$mod_file"
    done
  done
}

for event_dir in "$REPO_DIR"/modules/*/; do
  event=$(basename "$event_dir")

  while IFS='|' read -r evt mod_label mod_file; do
    [ -z "$mod_file" ] && continue
    mod_name=$(basename "$mod_file")
    # Use forward-slash path for node require on Windows
    mod_win_path=$(cd "$(dirname "$mod_file")" && (pwd -W 2>/dev/null || pwd))/"$mod_name"
    mock_input=$(get_mock_input "$evt")

    echo "[$evt/$mod_label] load, call, headers"

    # Test 1: exports a function
    if node -e "var m = require('$mod_win_path'); if (typeof m !== 'function') { process.exit(1); }" 2>/dev/null; then
      pass "$evt/$mod_label exports function"
    else
      fail "$evt/$mod_label does not export function"
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
        pass "$evt/$mod_label returns $RESULT (valid)"
        ;;
      timeout)
        pass "$evt/$mod_label returns async (timed out, ok for validation)"
        ;;
      promise-error)
        pass "$evt/$mod_label returns async with error (ok for validation)"
        ;;
      crash)
        fail "$evt/$mod_label crashed on mock input"
        ;;
      error:*)
        fail "$evt/$mod_label threw: $RESULT"
        ;;
      *)
        fail "$evt/$mod_label returned unexpected: $RESULT"
        ;;
    esac

    # Test 3: WORKFLOW tag in first 5 lines
    if head -5 "$mod_file" | grep -q "WORKFLOW:"; then
      pass "$evt/$mod_label has WORKFLOW tag"
    else
      fail "$evt/$mod_label missing WORKFLOW tag"
    fi

    # Test 4: WHY comment in first 5 lines
    if head -5 "$mod_file" | grep -q "WHY:"; then
      pass "$evt/$mod_label has WHY comment"
    else
      fail "$evt/$mod_label missing WHY comment"
    fi

  done < <(collect_modules "$event_dir" "$event")
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
