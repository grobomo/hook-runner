#!/usr/bin/env bash
# Tests for no-local-dashboard-gate.js (T729)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && (pwd -W 2>/dev/null || pwd))"
GATE="$REPO_DIR/modules/PreToolUse/llm-token-tracker/no-local-dashboard-gate.js"
PASS=0; FAIL=0

run_gate() {
  local json="$1"
  HOOK_RUNNER_TEST=1 node -e "
    var gate = require('$GATE');
    var input = JSON.parse(process.argv[1]);
    var result = gate(input);
    console.log(JSON.stringify(result));
  " "$json" 2>/dev/null
}

assert_block() {
  local desc="$1" json="$2"
  local result
  result=$(run_gate "$json")
  if echo "$result" | grep -q '"decision":"block"'; then
    PASS=$((PASS+1))
  else
    echo "FAIL: $desc — expected block, got: $result"
    FAIL=$((FAIL+1))
  fi
}

assert_pass() {
  local desc="$1" json="$2"
  local result
  result=$(run_gate "$json")
  if [ "$result" = "null" ] || [ -z "$result" ]; then
    PASS=$((PASS+1))
  else
    echo "FAIL: $desc — expected null, got: $result"
    FAIL=$((FAIL+1))
  fi
}

# --- SHOULD BLOCK ---

assert_block "curl localhost:4100/api/stats" \
  '{"tool_name":"Bash","tool_input":{"command":"curl http://localhost:4100/api/stats"}}'

assert_block "curl 127.0.0.1:4100/api/tokens" \
  '{"tool_name":"Bash","tool_input":{"command":"curl http://127.0.0.1:4100/api/tokens"}}'

assert_block "curl 0.0.0.0:4100/api/sessions" \
  '{"tool_name":"Bash","tool_input":{"command":"curl http://0.0.0.0:4100/api/sessions"}}'

assert_block "curl -s localhost:4100/api/usage with flags" \
  '{"tool_name":"Bash","tool_input":{"command":"curl -s http://localhost:4100/api/usage | jq ."}}'

assert_block "wget localhost:4100/api/data" \
  '{"tool_name":"Bash","tool_input":{"command":"wget -q http://localhost:4100/api/data"}}'

assert_block "node fetch localhost:4100/api/something" \
  '{"tool_name":"Bash","tool_input":{"command":"node -e \"fetch(\\\"http://127.0.0.1:4100/api/dashboard\\\")\""}}'

assert_block "pipe through jq" \
  '{"tool_name":"Bash","tool_input":{"command":"curl localhost:4100/api/fleet | python3 -c \"import json,sys; print(json.load(sys.stdin))\""}}'

# --- SHOULD PASS (allowed operational endpoints) ---

assert_pass "curl :4100/health" \
  '{"tool_name":"Bash","tool_input":{"command":"curl http://127.0.0.1:4100/health"}}'

assert_pass "curl :4100/diagnose" \
  '{"tool_name":"Bash","tool_input":{"command":"curl http://localhost:4100/diagnose"}}'

assert_pass "curl :4100/judge" \
  '{"tool_name":"Bash","tool_input":{"command":"curl -X POST http://127.0.0.1:4100/judge"}}'

assert_pass "curl :4100/ask" \
  '{"tool_name":"Bash","tool_input":{"command":"curl http://localhost:4100/ask"}}'

# --- SHOULD PASS (not matching) ---

assert_pass "curl tokentracker.click" \
  '{"tool_name":"Bash","tool_input":{"command":"curl https://tokentracker.click/api/stats"}}'

assert_pass "curl other port" \
  '{"tool_name":"Bash","tool_input":{"command":"curl http://localhost:3000/api/data"}}'

assert_pass "non-Bash tool" \
  '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/test.js","old_string":"a","new_string":"b"}}'

assert_pass "Bash non-curl command" \
  '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'

assert_pass "curl to different host with 4100 in path" \
  '{"tool_name":"Bash","tool_input":{"command":"curl https://example.com:4100/api/something"}}'

assert_pass "empty command" \
  '{"tool_name":"Bash","tool_input":{"command":""}}'

# --- Summary ---
echo ""
echo "no-local-dashboard-gate: $PASS passed, $FAIL failed (total $((PASS+FAIL)))"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
