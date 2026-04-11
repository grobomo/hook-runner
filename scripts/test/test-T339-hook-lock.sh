#!/usr/bin/env bash
# Test T339: Hook editing project lock + weakening detection + self-edit protection
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: hook-lock (T339) ==="

MODULE="$REPO_DIR/modules/PreToolUse/hook-editing-gate.js"
HOOKS_DIR="$HOME/.claude/hooks"

# Helper: run gate as hook-runner project
run_gate() {
  local tool="$1"
  local file_path="$2"
  local content="$3"
  local input
  if [ "$tool" = "Write" ]; then
    input="{\"file_path\":\"$file_path\",\"content\":$(printf '%s' "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
  else
    input="{\"file_path\":\"$file_path\",\"new_string\":$(printf '%s' "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
  fi
  CLAUDE_PROJECT_DIR="$REPO_DIR" node -e "
    var mod = require('$MODULE');
    var result = mod({ tool_name: '$tool', tool_input: JSON.parse(process.argv[1]) });
    if (result && result.decision === 'block') {
      process.stdout.write('BLOCKED: ' + result.reason.split('\n')[0]);
      process.exit(1);
    } else {
      process.stdout.write('PASSED');
    }
  " "$input" 2>&1 || true
}

# Helper: run gate as a different project (not hook-runner)
run_gate_other() {
  local tool="$1"
  local file_path="$2"
  local content="$3"
  local input
  if [ "$tool" = "Write" ]; then
    input="{\"file_path\":\"$file_path\",\"content\":$(printf '%s' "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
  else
    input="{\"file_path\":\"$file_path\",\"new_string\":$(printf '%s' "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
  fi
  CLAUDE_PROJECT_DIR="/tmp/some-other-project" node -e "
    var mod = require('$MODULE');
    var result = mod({ tool_name: '$tool', tool_input: JSON.parse(process.argv[1]) });
    if (result && result.decision === 'block') {
      process.stdout.write('BLOCKED: ' + result.reason.split('\n')[0]);
      process.exit(1);
    } else {
      process.stdout.write('PASSED');
    }
  " "$input" 2>&1 || true
}

GOOD_MODULE='// WORKFLOW: shtd
// WHY: Tests broke production
"use strict";
module.exports = function(input) { return null; };'

GOOD_RUNNER='if (result.decision) { process.exit(1); }'

# 1. Non-hook-runner project blocked from editing hook modules
OUTPUT=$(run_gate_other "Write" "$HOOKS_DIR/run-modules/PreToolUse/my-gate.js" "$GOOD_MODULE")
if echo "$OUTPUT" | grep -q "BLOCKED.*locked to the hook-runner"; then
  pass "non-hook-runner project blocked from editing hooks"
else
  fail "other project should be blocked: $OUTPUT"
fi

# 2. Non-hook-runner project blocked from editing runners
OUTPUT=$(run_gate_other "Edit" "$HOOKS_DIR/run-pretooluse.js" "$GOOD_RUNNER")
if echo "$OUTPUT" | grep -q "BLOCKED.*locked to the hook-runner"; then
  pass "non-hook-runner project blocked from editing runners"
else
  fail "other project should be blocked from runners: $OUTPUT"
fi

# 3. Non-hook-runner project blocked from editing settings.json
OUTPUT=$(run_gate_other "Edit" "$HOME/.claude/settings.json" "test content")
if echo "$OUTPUT" | grep -q "BLOCKED.*locked to the hook-runner"; then
  pass "non-hook-runner project blocked from editing settings.json"
else
  fail "other project should be blocked from settings: $OUTPUT"
fi

# 4. Self-edit of hook-editing-gate.js allowed from hook-runner (T413 removed self-edit protection)
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-modules/PreToolUse/hook-editing-gate.js" "var x = 1;")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "self-edit of hook-editing-gate.js allowed from hook-runner"
else
  fail "self-edit should pass from hook-runner: $OUTPUT"
fi

# 5. Safe small edits to modules pass from hook-runner project
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-modules/PreToolUse/some-gate.js" "var x = input.tool_name;")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "safe small edits pass from hook-runner"
else
  fail "safe edits should pass: $OUTPUT"
fi

# 6. Bare "return null" edit blocked as enforcement weakening
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-modules/PreToolUse/some-gate.js" "  return null;")
if echo "$OUTPUT" | grep -q "BLOCKED.*weakening"; then
  pass "bare return null edit blocked as enforcement weakening"
else
  fail "bare return null should be blocked: $OUTPUT"
fi

# 7. Hook-runner project can write modules (with quality checks passing)
OUTPUT=$(run_gate "Write" "$HOOKS_DIR/run-modules/PreToolUse/new-gate.js" "$GOOD_MODULE")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "hook-runner project can edit modules"
else
  fail "hook-runner should be allowed: $OUTPUT"
fi

# 8. Core hook files protected from other projects
OUTPUT=$(run_gate_other "Edit" "$HOOKS_DIR/load-modules.js" "var x = 1;")
if echo "$OUTPUT" | grep -q "BLOCKED.*locked to the hook-runner"; then
  pass "core hook files protected from other projects"
else
  fail "core files should be protected: $OUTPUT"
fi

# 9. Audit log is written (check .system-monitor/hook-audit.jsonl exists after gate calls)
AUDIT_LOG="$HOME/.system-monitor/hook-audit.jsonl"
if [ -f "$AUDIT_LOG" ]; then
  LINES=$(wc -l < "$AUDIT_LOG")
  if [ "$LINES" -gt 0 ]; then
    pass "audit log has entries"
  else
    fail "audit log exists but is empty"
  fi
else
  fail "audit log not created at $AUDIT_LOG"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
