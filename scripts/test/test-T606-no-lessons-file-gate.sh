#!/usr/bin/env bash
set -euo pipefail

echo "=== hook-runner: no-lessons-file-gate (T606) ==="
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MOD_POSIX="$(cd "$SCRIPT_DIR/../.." && pwd)/modules/PreToolUse/no-lessons-file-gate.js"
MOD="$(cygpath -m "$MOD_POSIX" 2>/dev/null || echo "$MOD_POSIX")"

run_gate() {
  local tool="$1"
  local json_input="$2"
  node -e "
    var mod = require('$MOD');
    var input = JSON.parse(process.argv[1]);
    var result = mod(input);
    process.stdout.write(result ? JSON.stringify(result) : 'null');
  " "$json_input" 2>/dev/null
}

# === Blocked: Edit/Write to lessons.jsonl ===
OUTPUT=$(run_gate "x" '{"tool_name":"Edit","tool_input":{"file_path":"/project/.claude/lessons.jsonl","old_string":"a","new_string":"b"}}')
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "blocks Edit to lessons.jsonl"
else
  fail "should block Edit to lessons.jsonl — got: $OUTPUT"
fi

OUTPUT=$(run_gate "x" '{"tool_name":"Write","tool_input":{"file_path":"C:\\Users\\test\\.claude\\lessons.jsonl","content":"test"}}')
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "blocks Write to lessons.jsonl (Windows path)"
else
  fail "should block Write to lessons.jsonl (Windows) — got: $OUTPUT"
fi

# === Blocked: Bash append to lessons.jsonl ===
OUTPUT=$(run_gate "x" '{"tool_name":"Bash","tool_input":{"command":"echo {\"lesson\":\"test\"} >> .claude/lessons.jsonl"}}')
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "blocks Bash >> lessons.jsonl"
else
  fail "should block Bash >> — got: $OUTPUT"
fi

OUTPUT=$(run_gate "x" '{"tool_name":"Bash","tool_input":{"command":"node -e \"fs.appendFileSync(lessons.jsonl, data)\""}}')
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "blocks node appendFileSync lessons.jsonl"
else
  fail "should block node appendFileSync — got: $OUTPUT"
fi

OUTPUT=$(run_gate "x" '{"tool_name":"Bash","tool_input":{"command":"printf \"{lesson: test}\" | tee -a lessons.jsonl"}}')
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "blocks tee to lessons.jsonl"
else
  fail "should block tee — got: $OUTPUT"
fi

# === Allowed: non-lessons files ===
OUTPUT=$(run_gate "x" '{"tool_name":"Edit","tool_input":{"file_path":"/project/src/app.js","old_string":"a","new_string":"b"}}')
if [ "$OUTPUT" = "null" ]; then
  pass "allows Edit to non-lessons file"
else
  fail "should allow Edit to non-lessons file — got: $OUTPUT"
fi

OUTPUT=$(run_gate "x" '{"tool_name":"Write","tool_input":{"file_path":"/project/.claude/settings.json","content":"test"}}')
if [ "$OUTPUT" = "null" ]; then
  pass "allows Write to settings.json"
else
  fail "should allow Write to settings.json — got: $OUTPUT"
fi

# === Allowed: Bash reading lessons.jsonl ===
OUTPUT=$(run_gate "x" '{"tool_name":"Bash","tool_input":{"command":"cat .claude/lessons.jsonl"}}')
if [ "$OUTPUT" = "null" ]; then
  pass "allows reading lessons.jsonl"
else
  fail "should allow reading lessons.jsonl — got: $OUTPUT"
fi

OUTPUT=$(run_gate "x" '{"tool_name":"Bash","tool_input":{"command":"grep lesson .claude/lessons.jsonl"}}')
if [ "$OUTPUT" = "null" ]; then
  pass "allows grep on lessons.jsonl"
else
  fail "should allow grep on lessons.jsonl — got: $OUTPUT"
fi

# === Allowed: other tools ===
OUTPUT=$(run_gate "x" '{"tool_name":"Read","tool_input":{"file_path":"lessons.jsonl"}}')
if [ "$OUTPUT" = "null" ]; then
  pass "allows Read tool (not Bash/Edit/Write)"
else
  fail "should allow Read tool — got: $OUTPUT"
fi

# === Block message quality ===
OUTPUT=$(run_gate "x" '{"tool_name":"Write","tool_input":{"file_path":"/project/lessons.jsonl","content":"test"}}')
if echo "$OUTPUT" | grep -q "WHY:" && echo "$OUTPUT" | grep -q "NEXT STEPS:"; then
  pass "block message has WHY + NEXT STEPS format"
else
  fail "block message should have WHY + NEXT STEPS format"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS + FAIL))"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
