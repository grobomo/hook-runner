#!/usr/bin/env bash
# Test T614: L1 Haiku triage in UserPromptSubmit runner
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: L1 Haiku Triage (T614) ==="

RUNNER="$REPO_DIR/run-userpromptsubmit.js"

# --- Section 1: Runner structure ---

# 1. Runner exists
if [ -f "$RUNNER" ]; then
  pass "run-userpromptsubmit.js exists"
else
  fail "run-userpromptsubmit.js missing"; echo "=== Results: $PASS passed, $FAIL failed ==="; exit 1
fi

# 2. Runner references haiku-client
if grep -q 'haiku-client' "$RUNNER"; then
  pass "Runner requires haiku-client"
else
  fail "Runner missing haiku-client require"
fi

# 3. Runner reads userprompt-haiku-rules.yaml
if grep -q 'userprompt-haiku-rules.yaml' "$RUNNER"; then
  pass "Runner reads userprompt-haiku-rules.yaml"
else
  fail "Runner missing rules file path"
fi

# 4. Runner has + bypass
if grep -q 'charAt(0).*"+"' "$RUNNER" || grep -q "prompt.charAt(0) !== \"+\"" "$RUNNER"; then
  pass "Runner has + prefix bypass"
else
  fail "Runner missing + prefix bypass"
fi

# 5. Runner has session-scoped analysis file
if grep -q 'l1-analysis-.*sessionPrefix' "$RUNNER"; then
  pass "Runner uses session-scoped analysis file"
else
  fail "Runner missing session-scoped file naming"
fi

# 6. Runner creates symlink for l1-analysis.md
if grep -q 'symlinkSync' "$RUNNER"; then
  pass "Runner creates l1-analysis.md symlink"
else
  fail "Runner missing symlink creation"
fi

# 7. Runner outputs to stdout for TUI
if grep -q 'process.stdout.write.*L1' "$RUNNER"; then
  pass "Runner writes L1 output to stdout"
else
  fail "Runner missing stdout output"
fi

# 8. Runner uses 4s timeout
if grep -q 'timeoutMs: 4000' "$RUNNER"; then
  pass "Runner uses 4s Haiku timeout"
else
  fail "Runner missing 4s timeout"
fi

# 9. Runner uses jsonMode
if grep -q 'jsonMode: true' "$RUNNER"; then
  pass "Runner uses jsonMode for structured response"
else
  fail "Runner missing jsonMode"
fi

# 10. Runner never blocks (exits 0)
if grep -q 'process.exit(0)' "$RUNNER"; then
  pass "Runner exits 0 (never blocks)"
else
  fail "Runner missing exit(0)"
fi

# 11. Runner has caller: l1-triage for log attribution
if grep -q '"l1-triage"' "$RUNNER"; then
  pass "Runner uses l1-triage caller for logging"
else
  fail "Runner missing l1-triage caller"
fi

# 12. Comment updated to reflect 3 capabilities
if grep -q 'THREE things directly' "$RUNNER"; then
  pass "Runner header updated for L1 triage"
else
  fail "Runner header still says TWO things"
fi

# 13. Runner truncates prompt to 500 chars
if grep -q 'slice(0, 500)' "$RUNNER"; then
  pass "Runner truncates prompt for Haiku"
else
  fail "Runner missing prompt truncation"
fi

# 14. Runner shows confidence level in output when not high
if grep -q 'confidence' "$RUNNER" && grep -q 'conf.*!==.*"high"' "$RUNNER"; then
  pass "Runner shows non-high confidence in output"
else
  fail "Runner missing confidence display logic"
fi

# 15. Runner wraps L1 in try-catch (fail silently)
L1_BLOCK=$(sed -n '/L1 Haiku triage/,/process.exit/p' "$RUNNER")
if echo "$L1_BLOCK" | grep -q 'catch.*e.*fail silently'; then
  pass "L1 block wrapped in try-catch (fail silently)"
else
  fail "L1 block missing safety try-catch"
fi

# --- Section 2: Rules file ---

RULES_PATH="$HOME/.claude/proxy/userprompt-haiku-rules.yaml"

# 16. Rules file exists
if [ -f "$RULES_PATH" ]; then
  pass "userprompt-haiku-rules.yaml exists"
else
  fail "userprompt-haiku-rules.yaml missing"
fi

# 17. Rules file has shorthand section
if grep -q 'shorthand:' "$RULES_PATH"; then
  pass "Rules file has shorthand section"
else
  fail "Rules file missing shorthand section"
fi

# 18. Rules file has interpretation_rules section
if grep -q 'interpretation_rules:' "$RULES_PATH"; then
  pass "Rules file has interpretation_rules section"
else
  fail "Rules file missing interpretation_rules section"
fi

# 19. Rules file has + bypass documentation
if grep -q 'BYPASS.*\+' "$RULES_PATH" || grep -q 'starting with "+"' "$RULES_PATH"; then
  pass "Rules file documents + bypass"
else
  fail "Rules file missing + bypass documentation"
fi

# --- Section 3: Repo runner matches live runner ---

LIVE_RUNNER="$HOME/.claude/hooks/run-userpromptsubmit.js"

# 20. Live runner has L1 triage
if [ -f "$LIVE_RUNNER" ] && grep -q 'L1 Haiku triage' "$LIVE_RUNNER"; then
  pass "Live runner has L1 triage"
else
  fail "Live runner missing L1 triage (not synced)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
