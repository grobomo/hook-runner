#!/usr/bin/env bash
# Test T629: gate-quality-gate Bash write detection
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: gate-quality-gate Bash detection (T629) ==="

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

MOD="$REPO_DIR/modules/PreToolUse/gate-quality-gate.js"

# Helper: run module with input JSON and check result
run_gate() {
  local json="$1"
  node -e "
    var mod = require('$MOD');
    var input = JSON.parse(process.argv[1]);
    var result = mod(input);
    console.log(result ? 'BLOCK' : 'PASS');
    if (result) console.log(result.reason.split('\\n')[0]);
  " "$json"
}

# --- Section 1: Bash write detection ---

# 1. Allow: cp .js to hooks/run-modules/ from hook-runner project (T822)
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"cp /tmp/test.js ~/.claude/hooks/run-modules/PreToolUse/test.js"}}')
if echo "$RESULT" | head -1 | grep -q "BLOCK"; then
  fail "Should allow cp from hook-runner project — got: $RESULT"
else
  pass "Allows cp to hooks/run-modules/ from hook-runner project"
fi

# 2. Block: python write_text to hook module
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"python3 -c \"from pathlib import Path; Path('"'"'hooks/run-modules/PreToolUse/bad-gate.js'"'"').write_text('"'"'x'"'"')\""}}')
if echo "$RESULT" | head -1 | grep -q "BLOCK"; then
  pass "Blocks python write_text to hooks/run-modules/"
else
  fail "Should block python write_text — got: $RESULT"
fi

# 3. Block: redirect to hook module
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"echo code > ~/.claude/hooks/run-modules/Stop/bad-gate.js"}}')
if echo "$RESULT" | head -1 | grep -q "BLOCK"; then
  pass "Blocks redirect to hooks/run-modules/"
else
  fail "Should block redirect — got: $RESULT"
fi

# 4. Block: heredoc to live hooks/run-modules/ (T735: repo path no longer triggers Bash block)
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"cat <<EOF > ~/.claude/hooks/run-modules/PreToolUse/bad.js\ncode\nEOF"}}')
if echo "$RESULT" | head -1 | grep -q "BLOCK"; then
  pass "Blocks heredoc to hooks/run-modules/"
else
  fail "Should block heredoc — got: $RESULT"
fi

# 5. Block: tee to hook module
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"echo x | tee ~/.claude/hooks/run-modules/PreToolUse/new-gate.js"}}')
if echo "$RESULT" | head -1 | grep -q "BLOCK"; then
  pass "Blocks tee to hooks/run-modules/"
else
  fail "Should block tee — got: $RESULT"
fi

# 6. Block: sed -i on hook module
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"sed -i s/old/new/ hooks/run-modules/PreToolUse/gate.js"}}')
if echo "$RESULT" | head -1 | grep -q "BLOCK"; then
  pass "Blocks sed -i on hooks/run-modules/"
else
  fail "Should block sed -i — got: $RESULT"
fi

# 7. mv from hook-runner project: T779 allows mv from hook-runner (the only project that can edit hooks)
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"mv /tmp/gate.js hooks/run-modules/PreToolUse/gate.js"}}')
if echo "$RESULT" | head -1 | grep -q "PASS"; then
  pass "Allows mv from hook-runner project (T779)"
else
  fail "Should allow mv from hook-runner — got: $RESULT"
fi

# --- Section 2: Bash read-only operations pass ---

# 8. Pass: grep in hooks directory
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"grep -n TOOLS hooks/run-modules/PreToolUse/gate-quality-gate.js"}}')
if echo "$RESULT" | head -1 | grep -q "PASS"; then
  pass "Allows grep in hooks/run-modules/"
else
  fail "Should pass grep — got: $RESULT"
fi

# 9. Pass: ls hooks directory
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"ls ~/.claude/hooks/run-modules/PreToolUse/gate-quality-gate.js"}}')
if echo "$RESULT" | head -1 | grep -q "PASS"; then
  pass "Allows ls in hooks/run-modules/"
else
  fail "Should pass ls — got: $RESULT"
fi

# 10. Pass: head/tail on hook file
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"head -10 hooks/run-modules/PreToolUse/gate-quality-gate.js"}}')
if echo "$RESULT" | head -1 | grep -q "PASS"; then
  pass "Allows head on hooks/run-modules/"
else
  fail "Should pass head — got: $RESULT"
fi

# 11. Pass: diff on hook files
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"diff hooks/run-modules/PreToolUse/a-gate.js hooks/run-modules/PreToolUse/b-gate.js"}}')
if echo "$RESULT" | head -1 | grep -q "PASS"; then
  pass "Allows diff in hooks/run-modules/"
else
  fail "Should pass diff — got: $RESULT"
fi

# --- Section 3: Non-hook Bash commands pass ---

# 12. Pass: cp to non-hook directory
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"cp /tmp/test.js /tmp/other.js"}}')
if echo "$RESULT" | head -1 | grep -q "PASS"; then
  pass "Allows cp to non-hook directory"
else
  fail "Should pass non-hook cp — got: $RESULT"
fi

# 13. Pass: non-.js file in hooks directory
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"cp /tmp/config.yaml hooks/run-modules/config.yaml"}}')
if echo "$RESULT" | head -1 | grep -q "PASS"; then
  pass "Allows non-.js file copy to hooks directory"
else
  fail "Should pass non-.js copy — got: $RESULT"
fi

# 14. Pass: stderr redirect (2>/dev/null) should not trigger
RESULT=$(run_gate '{"tool_name":"Bash","tool_input":{"command":"node hooks/run-modules/PreToolUse/gate-quality-gate.js 2>/dev/null"}}')
if echo "$RESULT" | head -1 | grep -q "PASS"; then
  pass "Allows stderr redirect (2>/dev/null)"
else
  fail "Should pass stderr redirect — got: $RESULT"
fi

# --- Section 4: Edit/Write tool detection ---

# 15. Block: Edit removes WHY comment
RESULT=$(run_gate '{"tool_name":"Edit","tool_input":{"file_path":"/home/.claude/hooks/run-modules/PreToolUse/test-gate.js","old_string":"// WHY: reason","new_string":"// no reason"}}')
if echo "$RESULT" | head -1 | grep -q "BLOCK"; then
  pass "Blocks Edit that removes // WHY:"
else
  fail "Should block WHY removal — got: $RESULT"
fi

# 16. Pass: Edit to non-hook file
RESULT=$(run_gate '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/test.js","old_string":"old","new_string":"new"}}')
if echo "$RESULT" | head -1 | grep -q "PASS"; then
  pass "Passes Edit to non-hook file"
else
  fail "Should pass non-hook Edit — got: $RESULT"
fi

# --- Section 5: Module has correct tags ---

# 17. TOOLS tag includes Bash
if grep -q '// TOOLS:.*Bash' "$MOD"; then
  pass "Module has Bash in TOOLS tag"
else
  fail "Module missing Bash in TOOLS tag"
fi

# 18. Has WHY tag
if grep -q '// WHY:' "$MOD"; then
  pass "Module has WHY tag"
else
  fail "Module missing WHY tag"
fi

# 19. Has WORKFLOW tag
if grep -q '// WORKFLOW:' "$MOD"; then
  pass "Module has WORKFLOW tag"
else
  fail "Module missing WORKFLOW tag"
fi

# 20. Has T629 incident history entry
if grep -q 'T629' "$MOD"; then
  pass "Module has T629 incident reference"
else
  fail "Module missing T629 reference"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
