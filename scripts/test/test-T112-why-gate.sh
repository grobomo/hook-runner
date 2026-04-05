#!/usr/bin/env bash
# Test T112: why-reminder PreToolUse module
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: why-reminder gate ==="

MOD="$REPO_DIR/modules/PreToolUse/why-reminder.js"

# 1. Module exports a function
check "module exports function" 'node -e "var m = require(\"'$MOD'\"); console.log(typeof m);" 2>&1 | grep -q "function"'

# 2. Returns null for non-Write/Edit tools
OUT_BASH=$(node -e "
  var m = require('$MOD');
  var r = m({tool_name:'Bash', tool_input:'{}'});
  console.log(r === null ? 'null' : JSON.stringify(r));
" 2>&1)
check "skips Bash tool" '[ "$OUT_BASH" = "null" ]'

# 3. Returns reminder text for Write to .js file
OUT_WRITE=$(node -e "
  var m = require('$MOD');
  var r = m({tool_name:'Write', tool_input: JSON.stringify({file_path:'/tmp/foo.js', content:'// hello'})});
  console.log(r === null ? 'null' : (r.text ? 'has-text' : JSON.stringify(r)));
" 2>&1)
check "returns reminder for Write to .js" '[ "$OUT_WRITE" = "has-text" ]'

# 4. Returns reminder for Edit to .py file
OUT_EDIT=$(node -e "
  var m = require('$MOD');
  var r = m({tool_name:'Edit', tool_input: JSON.stringify({file_path:'/tmp/foo.py', old_string:'x', new_string:'y'})});
  console.log(r === null ? 'null' : (r.text ? 'has-text' : JSON.stringify(r)));
" 2>&1)
check "returns reminder for Edit to .py" '[ "$OUT_EDIT" = "has-text" ]'

# 5. Skips non-code files (images, binaries)
OUT_PNG=$(node -e "
  var m = require('$MOD');
  var r = m({tool_name:'Write', tool_input: JSON.stringify({file_path:'/tmp/foo.png', content:'binary'})});
  console.log(r === null ? 'null' : 'not-null');
" 2>&1)
check "skips binary files" '[ "$OUT_PNG" = "null" ]'

# 6. Has WORKFLOW tag
check "has WORKFLOW tag" 'head -1 "$MOD" | grep -q "WORKFLOW: shtd"'

# 7. Reminder text mentions WHY
OUT_TEXT=$(node -e "
  var m = require('$MOD');
  var r = m({tool_name:'Write', tool_input: JSON.stringify({file_path:'/tmp/foo.js', content:'// hi'})});
  console.log(r && r.text ? r.text : '');
" 2>&1)
check "reminder mentions WHY" 'echo "$OUT_TEXT" | grep -qi "why"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
