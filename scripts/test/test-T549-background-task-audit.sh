#!/usr/bin/env bash
# Test T549: background-task-audit PostToolUse module
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: T549 background-task-audit ==="

MOD="$REPO_DIR/modules/PostToolUse/background-task-audit.js"
H="node $REPO_DIR/scripts/test/.t549-helper.js"

# --- Module structure ---
check "exports function" 'node -e "var m = require(process.argv[1]); process.exit(typeof m === \"function\" ? 0 : 1)" "$MOD" 2>/dev/null'
check "has WORKFLOW tag" 'head -3 "$MOD" | grep -q "WORKFLOW:"'
check "has WHY comment" 'head -10 "$MOD" | grep -q "// WHY:"'
check "has TOOLS: TaskOutput tag" 'head -3 "$MOD" | grep -q "TOOLS:.*TaskOutput"'

# --- Tool filtering ---
OUT=$($H skip-non-taskoutput)
check "skips non-TaskOutput tools" '[ "$OUT" = "null" ]'

# --- Case 1: Completed with zero output ---
OUT=$($H completed-zero-output)
check "blocks completed + zero output" '[ "$OUT" = "block" ]'

OUT=$($H completed-zero-reason)
check "reason mentions ZERO OUTPUT" 'echo "$OUT" | grep -qi "ZERO OUTPUT"'

OUT=$($H completed-zero-reason)
check "reason suggests foreground run" 'echo "$OUT" | grep -qi "foreground"'

OUT=$($H completed-with-output)
check "allows completed + has output" '[ "$OUT" = "null" ]'

OUT=$($H whitespace-output)
check "whitespace-only output = zero" '[ "$OUT" = "block" ]'

# --- Case 2: Timeout with zero output ---
OUT=$($H timeout-zero-output)
check "blocks timeout + zero output" '[ "$OUT" = "block" ]'

OUT=$($H timeout-zero-reason)
check "timeout reason mentions hang" 'echo "$OUT" | grep -qi "hang"'

OUT=$($H timeout-with-output)
check "allows timeout + partial output" '[ "$OUT" = "null" ]'

# --- Case 3: Repeated not_ready polls ---
$H clean-poll1 >/dev/null
OUT=$($H not-ready-first)
check "first not_ready poll allowed" '[ "$OUT" = "null" ]'

OUT=$($H not-ready-second)
check "second not_ready poll blocks" '[ "$OUT" = "block" ]'

OUT=$($H not-ready-second-reason)
check "block reason mentions poll count" 'echo "$OUT" | grep -q "polled"'

OUT=$($H not-ready-with-output)
check "not_ready + output on 2nd check allowed" '[ "$OUT" = "null" ]'

# --- Edge cases ---
OUT=$($H no-tool-result)
check "handles undefined tool_result" '[ "$OUT" = "null" ]'

# --- Workflow presence ---
check "in starter workflow" 'grep -q "background-task-audit" "$REPO_DIR/workflows/starter.yml"'
check "in shtd workflow" 'grep -q "background-task-audit" "$REPO_DIR/workflows/shtd.yml"'
check "in gsd workflow" 'grep -q "background-task-audit" "$REPO_DIR/workflows/gsd.yml"'

# --- README ---
check "in README module table" 'grep -q "background-task-audit" "$REPO_DIR/README.md"'

# Cleanup
$H clean-poll1 >/dev/null 2>&1 || true

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
