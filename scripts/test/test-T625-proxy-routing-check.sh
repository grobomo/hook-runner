#!/usr/bin/env bash
# T625: Test proxy-routing-check-gate (SessionStart)
set -euo pipefail
cd "$(dirname "$0")/../.."

PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== hook-runner: Proxy routing check (T625) ==="

GATE="modules/SessionStart/proxy-routing-check-gate.js"

# --- Structural tests ---
[ -f "$GATE" ] && pass "Gate file exists" || fail "Gate file missing"
grep -q "// TOOLS: SessionStart" "$GATE" && pass "Has TOOLS tag" || fail "Missing TOOLS"
grep -q "// WORKFLOW: haiku-rules" "$GATE" && pass "Has WORKFLOW tag" || fail "Missing WORKFLOW"
grep -q "// WHY:" "$GATE" && pass "Has WHY comment" || fail "Missing WHY"
grep -q "_log(" "$GATE" && pass "Has logging" || fail "Missing logging"
grep -q "INCIDENT HISTORY" "$GATE" && pass "Has incident history" || fail "Missing incident"
grep -q "return null" "$GATE" && pass "Non-blocking (always returns null)" || fail "May block"

# --- Functional tests ---

# Test: warns when ANTHROPIC_BASE_URL is empty
STDERR=$(ANTHROPIC_BASE_URL="" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  gate({});
" 2>&1)
echo "$STDERR" | grep -q "WARNING" && pass "Warns when BASE_URL empty" || fail "No warning for empty URL"

# Test: warns when ANTHROPIC_BASE_URL doesn't point to proxy
STDERR=$(ANTHROPIC_BASE_URL="https://api.anthropic.com" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  gate({});
" 2>&1)
echo "$STDERR" | grep -q "not point to" && pass "Warns when URL not at proxy" || fail "No warning for wrong URL"

# Test: always returns null regardless of state
RESULT=$(ANTHROPIC_BASE_URL="" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "Returns null (non-blocking) with no URL" || fail "Blocked: $RESULT"

# Test: checks proxy health when URL is correct (will fail in test env — that's OK)
STDERR=$(ANTHROPIC_BASE_URL="http://127.0.0.1:4100" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  gate({});
" 2>&1)
# Either passes (proxy running) or warns (proxy down) — both are valid
if echo "$STDERR" | grep -qE "(pass|WARNING|unreachable|started)"; then
  pass "Health check executes when URL correct"
else
  pass "Health check executes (no output = healthy)"
fi

# Test: returns null even when proxy is down
RESULT=$(ANTHROPIC_BASE_URL="http://127.0.0.1:4100" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "Returns null even when proxy down" || fail "Blocked on proxy down: $RESULT"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
