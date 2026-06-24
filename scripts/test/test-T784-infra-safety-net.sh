#!/usr/bin/env bash
# T784: Test infra-safety-net false positive fix
# Short assistant messages should proceed to Haiku, not trigger infra-safety-net
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && (pwd -W 2>/dev/null || pwd))"
GATE="$PROJECT_DIR/modules/Stop/1-haiku/auto-continue-gate.js"
PASS=0; FAIL=0; TOTAL=0

# Create temp environment
TMPDIR_RAW=$(mktemp -d)
TMPDIR="$(cd "$TMPDIR_RAW" && (pwd -W 2>/dev/null || pwd))"
trap 'rm -rf "$TMPDIR_RAW"' EXIT

mkdir -p "$TMPDIR/.claude/hooks"
mkdir -p "$TMPDIR/.claude/proxy"

# Create haiku-client stub
cat > "$TMPDIR/.claude/hooks/haiku-client.js" << 'STUB'
module.exports = {
  call: function(opts) {
    return {
      ok: true,
      content: '{"decision":"DONE","triggered_rule":"none","reason":"task complete","actions":[]}',
      parsed: {decision:"DONE",triggered_rule:"none",reason:"task complete",actions:[]},
      ms: 10
    };
  },
  getConversationContext: function() { return ""; },
  DEFAULT_CONFIG: { proxyUrl: "http://127.0.0.1:4100/v1/chat/completions", model: "claude-4.5-haiku", maxTokens: 500, timeoutMs: 12000 }
};
STUB

# Create minimal stop rules
cat > "$TMPDIR/.claude/proxy/stop-haiku-rules.yaml" << 'YAML'
rules:
  - name: test-rule
    check: "Is there more work to do?"
    action: "CONTINUE — keep working"
YAML

run_test() {
  local desc="$1" input="$2" expected_pattern="$3"
  TOTAL=$((TOTAL + 1))
  local result
  result=$(echo "$input" | HOME="$TMPDIR" CLAUDE_SESSION_ID="test-sess-1234" HOOK_RUNNER_TEST=1 node -e "
    process.env.HOME = '$TMPDIR';
    process.env.CLAUDE_SESSION_ID = 'test-sess-1234';
    var gate = require('$GATE');
    var input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
    var r = gate(input);
    if (r && r.reason) process.stdout.write(r.reason);
    else process.stdout.write('null');
  " 2>/dev/null) || result="error"

  if [[ "$result" == *"$expected_pattern"* ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc (expected pattern '$expected_pattern', got '${result:0:120}')"
  fi
}

echo "=== T784: Infra-Safety-Net False Positive Fix ==="

# Core fix: short last_assistant_message should NOT trigger infra-safety-net
run_test "Short last_assistant_message proceeds to Haiku (no infra-safety-net)" \
  '{"last_assistant_message":"14/20. No changes."}' \
  "SELF-CHECK"

# Very short message (1 char) — still should NOT be infra-safety-net
run_test "Single-char message proceeds to Haiku" \
  '{"last_assistant_message":"x"}' \
  "SELF-CHECK"

# Empty string message — should trigger infra-safety-net (no real content)
run_test "Empty string message triggers infra-safety-net" \
  '{"last_assistant_message":""}' \
  "infra-safety-net"

# No message fields at all — should trigger infra-safety-net
run_test "No message fields triggers infra-safety-net" \
  '{}' \
  "infra-safety-net"

# Normal-length message works fine
run_test "Normal-length message proceeds to Haiku" \
  '{"last_assistant_message":"I have completed the implementation of the login system with proper error handling."}' \
  "SELF-CHECK"

# assistant_message field (alternative name)
run_test "assistant_message field (short) proceeds to Haiku" \
  '{"assistant_message":"Done."}' \
  "SELF-CHECK"

# message field as fallback (short)
run_test "message field (short) proceeds to Haiku" \
  '{"message":"OK"}' \
  "SELF-CHECK"

echo ""
echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
