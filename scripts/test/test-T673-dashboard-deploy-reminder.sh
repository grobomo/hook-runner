#!/usr/bin/env bash
# T673: Test dashboard-deploy-reminder-gate
set -euo pipefail
cd "$(dirname "$0")/../.."

PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== hook-runner: Dashboard deploy reminder (T673) ==="

GATE="modules/PreToolUse/llm-token-tracker/dashboard-deploy-reminder-gate.js"

# --- Structural tests ---
[ -f "$GATE" ] && pass "Gate file exists" || fail "Gate file missing"
grep -q "// TOOLS: Edit, Write" "$GATE" && pass "Has TOOLS tag" || fail "Missing TOOLS"
grep -q "// WHY:" "$GATE" && pass "Has WHY comment" || fail "Missing WHY"
grep -q "_log(" "$GATE" && pass "Has logging" || fail "Missing logging"
grep -q "INCIDENT HISTORY" "$GATE" && pass "Has incident history" || fail "Missing incident"
grep -q "return null" "$GATE" && pass "Non-blocking (returns null)" || fail "May block incorrectly"

# --- Functional tests ---

# Test: skips non-Edit/Write tools
RESULT=$(HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'Bash', tool_input:{command:'echo hi'}});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "Skips Bash tool" || fail "Didn't skip Bash: $RESULT"

# Test: skips non-dashboard files
RESULT=$(HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/home/user/src/main.js'}});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "Skips non-dashboard files" || fail "Didn't skip: $RESULT"

# Test: fires on dashboard HTML edit
STDERR=$(HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  gate({tool_name:'Edit', tool_input:{file_path:'/home/user/llm-token-tracker/dashboard/index.html'}});
" 2>&1)
echo "$STDERR" | grep -q "REMINDER" && pass "Emits reminder for dashboard HTML" || fail "No reminder for HTML: $STDERR"
echo "$STDERR" | grep -q "s3://" && pass "Reminder mentions S3" || fail "Reminder missing S3"
echo "$STDERR" | grep -q "CloudFront" && pass "Reminder mentions CloudFront" || fail "Reminder missing CloudFront"
echo "$STDERR" | grep -q "tokentracker.click" && pass "Reminder mentions public URL" || fail "Reminder missing URL"

# Test: fires on dashboard CSS write
STDERR=$(HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  gate({tool_name:'Write', tool_input:{file_path:'/path/to/dashboard/style.css'}});
" 2>&1)
echo "$STDERR" | grep -q "REMINDER" && pass "Emits reminder for dashboard CSS" || fail "No reminder for CSS"

# Test: fires on dashboard JS
STDERR=$(HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  gate({tool_name:'Edit', tool_input:{file_path:'/home/user/dashboard/app.js'}});
" 2>&1)
echo "$STDERR" | grep -q "REMINDER" && pass "Emits reminder for dashboard JS" || fail "No reminder for JS"

# Test: always returns null (non-blocking)
RESULT=$(HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/dashboard/index.html'}});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "Always returns null (non-blocking)" || fail "Returned non-null: $RESULT"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
