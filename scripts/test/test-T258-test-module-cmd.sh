#!/usr/bin/env bash
# Test --test-module CLI command
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PASS=0; FAIL=0

check() {
  if [ $? -eq 0 ]; then echo "  PASS: $1"; PASS=$((PASS+1))
  else echo "  FAIL: $1"; FAIL=$((FAIL+1)); fi
}

echo "=== hook-runner: --test-module tests ==="

echo "[1] No arg shows usage and exits non-zero"
OUT=$(node "$REPO_DIR/setup.js" --test-module 2>&1 || true)
echo "$OUT" | grep -q "Usage:" && check "usage shown" || { echo "  FAIL: usage not shown"; FAIL=$((FAIL+1)); }

echo "[2] Missing module exits non-zero"
OUT=$(node "$REPO_DIR/setup.js" --test-module nonexistent.js 2>&1 || true)
echo "$OUT" | grep -q "Module not found" && check "not found error" || { echo "  FAIL: no error"; FAIL=$((FAIL+1)); }

echo "[3] Valid PreToolUse module runs with defaults"
OUT=$(node "$REPO_DIR/setup.js" --test-module "$REPO_DIR/modules/PreToolUse/secret-scan-gate.js" 2>&1)
echo "$OUT" | grep -q "WORKFLOW tag:" && check "workflow tag shown" || { echo "  FAIL: no workflow tag"; FAIL=$((FAIL+1)); }
echo "$OUT" | grep -q "WHY comment:" && check "why comment shown" || { echo "  FAIL: no why comment"; FAIL=$((FAIL+1)); }
echo "$OUT" | grep -q "pass" && check "has pass results" || { echo "  FAIL: no pass results"; FAIL=$((FAIL+1)); }

echo "[4] Valid PostToolUse module runs"
OUT=$(node "$REPO_DIR/setup.js" --test-module "$REPO_DIR/modules/PostToolUse/commit-msg-check.js" 2>&1)
echo "$OUT" | grep -q "exports function" && check "loads function" || { echo "  FAIL: not a function"; FAIL=$((FAIL+1)); }

echo "[5] Custom --input JSON file"
TMPINPUT=$(mktemp)
cat > "$TMPINPUT" <<'JSONEOF'
[{"tool_name": "Bash", "tool_input": {"command": "echo hello"}}]
JSONEOF
OUT=$(node "$REPO_DIR/setup.js" --test-module "$REPO_DIR/modules/PreToolUse/secret-scan-gate.js" --input "$TMPINPUT" 2>&1)
echo "$OUT" | grep -q "1 inputs:" && check "custom input used" || { echo "  FAIL: custom input not used"; FAIL=$((FAIL+1)); }
rm -f "$TMPINPUT"

echo "[6] Invalid --input file exits non-zero"
TMPBAD=$(mktemp)
echo "not json" > "$TMPBAD"
OUT=$(node "$REPO_DIR/setup.js" --test-module "$REPO_DIR/modules/PreToolUse/secret-scan-gate.js" --input "$TMPBAD" 2>&1 || true)
echo "$OUT" | grep -q "Could not parse" && check "parse error shown" || { echo "  FAIL: no parse error"; FAIL=$((FAIL+1)); }
rm -f "$TMPBAD"

echo "[7] SessionStart module runs"
OUT=$(node "$REPO_DIR/setup.js" --test-module "$REPO_DIR/modules/SessionStart/load-lessons.js" 2>&1)
echo "$OUT" | grep -q "exports function" && check "loads function" || { echo "  FAIL: not a function"; FAIL=$((FAIL+1)); }

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
