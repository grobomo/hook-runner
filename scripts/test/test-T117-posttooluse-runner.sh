#!/usr/bin/env bash
# WHY: T117 — verify PostToolUse runner normalizes Windows paths and exits correctly on blocks
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== hook-runner: PostToolUse runner fixes ==="
PASS=0; FAIL=0

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"; FAIL=$((FAIL+1))
  fi
}

# Test: runner file has path normalization
if grep -q 'file_path.*replace.*\\\\' run-posttooluse.js 2>/dev/null; then
  assert "has file_path backslash normalization" "0" "0"
else
  assert "has file_path backslash normalization" "0" "1"
fi

# Test: runner uses exit(1) for blocks (not exit(0))
if grep -q 'process.exit(1)' run-posttooluse.js 2>/dev/null; then
  assert "uses exit(1) for blocks" "0" "0"
else
  assert "uses exit(1) for blocks" "0" "1"
fi

# Test: runner has stderr output before stdout for blocks
if grep -q 'stderr.write' run-posttooluse.js 2>/dev/null; then
  assert "has stderr output for TUI visibility" "0" "0"
else
  assert "has stderr output for TUI visibility" "0" "1"
fi

# Test: runner loads modules from PostToolUse dir
# Pattern split across two lines: modulesDir = ...run-modules, then loadModules(..., "PostToolUse")
if grep -q '"PostToolUse"' run-posttooluse.js 2>/dev/null; then
  assert "loads PostToolUse modules" "0" "0"
else
  assert "loads PostToolUse modules" "0" "1"
fi

# Test: PreToolUse runner also normalizes Windows paths (T227)
if grep -q 'file_path.*replace.*\\\\' run-pretooluse.js 2>/dev/null; then
  assert "PreToolUse has file_path backslash normalization" "0" "0"
else
  assert "PreToolUse has file_path backslash normalization" "0" "1"
fi

if grep -q 'tool_input.path.*replace.*\\\\' run-pretooluse.js 2>/dev/null; then
  assert "PreToolUse has path backslash normalization" "0" "0"
else
  assert "PreToolUse has path backslash normalization" "0" "1"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
