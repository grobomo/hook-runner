#!/usr/bin/env bash
# Test T118: hook-editing-gate enforces quality standards
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: hook-editing-gate (T118) ==="

# Skip claude -p peer review in tests
export HOOK_RUNNER_TEST=1

MODULE="$REPO_DIR/modules/PreToolUse/hook-editing-gate.js"
# Use $HOME for portable test paths
HOOKS_DIR="$HOME/.claude/hooks"

run_gate() {
  local tool="$1"
  local file_path="$2"
  local content="$3"
  local input
  if [ "$tool" = "Write" ]; then
    input="{\"file_path\":\"$file_path\",\"content\":$(echo "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
  else
    input="{\"file_path\":\"$file_path\",\"new_string\":$(echo "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
  fi
  # T339: Set CLAUDE_PROJECT_DIR to hook-runner so project lock allows edits
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

# T339: Run gate as a non-hook-runner project (should be blocked)
run_gate_other() {
  local tool="$1"
  local file_path="$2"
  local content="$3"
  local input
  if [ "$tool" = "Write" ]; then
    input="{\"file_path\":\"$file_path\",\"content\":$(echo "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
  else
    input="{\"file_path\":\"$file_path\",\"new_string\":$(echo "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
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

# 1. Non-hook files pass through
OUTPUT=$(run_gate "Edit" "/some/src/app.js" "console.log('hi')")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "non-hook files pass through"
else
  fail "non-hook should pass: $OUTPUT"
fi

# 2. Module with WORKFLOW and WHY passes
GOOD_MODULE='// WORKFLOW: shtd
// WHY: Tests broke production
"use strict";
module.exports = function(input) { return null; };'
OUTPUT=$(run_gate "Write" "$HOOKS_DIR/run-modules/PreToolUse/my-gate.js" "$GOOD_MODULE")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "module with WORKFLOW + WHY passes"
else
  fail "good module should pass: $OUTPUT"
fi

# 3. Module missing WORKFLOW tag blocks
BAD_NO_WORKFLOW='// WHY: Tests broke
"use strict";
module.exports = function(input) { return null; };'
OUTPUT=$(run_gate "Write" "$HOOKS_DIR/run-modules/PreToolUse/bad-gate.js" "$BAD_NO_WORKFLOW")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "module without WORKFLOW tag blocked"
else
  fail "missing WORKFLOW should block: $OUTPUT"
fi

# 4. Module missing WHY comment blocks
BAD_NO_WHY='// WORKFLOW: shtd
"use strict";
module.exports = function(input) { return null; };'
OUTPUT=$(run_gate "Write" "$HOOKS_DIR/run-modules/PreToolUse/no-why.js" "$BAD_NO_WHY")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "module without WHY comment blocked"
else
  fail "missing WHY should block: $OUTPUT"
fi

# 5. Runner with exit(0) in block context blocked
BAD_RUNNER='if (result.decision === "block") { process.exit(0); }'
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-pretooluse.js" "$BAD_RUNNER")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "runner with exit(0) for blocks blocked"
else
  fail "exit(0) in block should block: $OUTPUT"
fi

# 6. Runner with exit(1) for blocks passes
GOOD_RUNNER='if (result.decision === "block") { process.exit(1); }'
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-pretooluse.js" "$GOOD_RUNNER")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "runner with exit(1) for blocks passes"
else
  fail "exit(1) should pass: $OUTPUT"
fi

# 7. Small safe edits to modules pass (not full file writes)
SMALL_EDIT='var x = 42;'
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-modules/PreToolUse/some.js" "$SMALL_EDIT")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "small safe edits pass (no WORKFLOW/WHY check)"
else
  fail "small edits should pass: $OUTPUT"
fi

# 8. ANY UserPromptSubmit module is FORBIDDEN (even safe ones)
BLOCK_UPS='// WORKFLOW: shtd
// WHY: Detect frustration
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "frustrated" };
};'
OUTPUT=$(run_gate "Write" "$HOOKS_DIR/run-modules/UserPromptSubmit/bad-blocker.js" "$BLOCK_UPS")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "UserPromptSubmit module with block decision is forbidden"
else
  fail "UPS block should be forbidden: $OUTPUT"
fi

# 9. Even a safe UserPromptSubmit module (returns null) is forbidden
SAFE_UPS='// WORKFLOW: shtd
// WHY: Log prompts for audit
"use strict";
module.exports = function(input) {
  return null;
};'
OUTPUT=$(run_gate "Write" "$HOOKS_DIR/run-modules/UserPromptSubmit/safe-logger.js" "$SAFE_UPS")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "UserPromptSubmit module returning null is also forbidden"
else
  fail "ALL UPS modules should be forbidden: $OUTPUT"
fi

# 10. PreToolUse module with block decision still allowed (only UPS is forbidden)
BLOCK_PTU='// WORKFLOW: shtd
// WHY: Gate something
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "not allowed" };
};'
OUTPUT=$(run_gate "Write" "$HOOKS_DIR/run-modules/PreToolUse/ok-blocker.js" "$BLOCK_PTU")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "PreToolUse module with block decision still allowed"
else
  fail "PTU block should be allowed: $OUTPUT"
fi

# 11. T339: Non-hook-runner project blocked from editing hook modules
GOOD_RUNNER='if (result.decision === "block") { process.exit(1); }'
OUTPUT=$(run_gate_other "Write" "$HOOKS_DIR/run-modules/PreToolUse/my-gate.js" "$GOOD_MODULE")
if echo "$OUTPUT" | grep -q "BLOCKED.*hook-runner"; then
  pass "non-hook-runner project blocked from editing hooks"
else
  fail "other project should be blocked: $OUTPUT"
fi

# 12. T339: Non-hook-runner project blocked from editing runners
OUTPUT=$(run_gate_other "Edit" "$HOOKS_DIR/run-pretooluse.js" "$GOOD_RUNNER")
if echo "$OUTPUT" | grep -q "BLOCKED.*hook-runner"; then
  pass "non-hook-runner project blocked from editing runners"
else
  fail "other project should be blocked from runners: $OUTPUT"
fi

# 13. T339: Non-hook-runner project blocked from editing settings
OUTPUT=$(run_gate_other "Edit" "$HOME/.claude/settings.json" 'hooks config change')
if echo "$OUTPUT" | grep -q "BLOCKED.*hook-runner"; then
  pass "non-hook-runner project blocked from editing settings.json"
else
  fail "other project should be blocked from settings: $OUTPUT"
fi

# 14. T413: hook-runner CAN edit hook-editing-gate.js (it's the gatekeeper)
# But weakening detector still catches malicious content like bare "return null;"
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-modules/PreToolUse/hook-editing-gate.js" "return null;")
if echo "$OUTPUT" | grep -q "BLOCKED.*weakening"; then
  pass "hook-editing-gate.js editable from hook-runner but weakening still caught"
else
  fail "weakening detector should catch bare return null: $OUTPUT"
fi

# 15. T413: legitimate edit to hook-editing-gate.js passes from hook-runner
LEGIT_EDIT='var timeout = 5000;
var label = "gate";'
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-modules/PreToolUse/hook-editing-gate.js" "$LEGIT_EDIT")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "legitimate edit to hook-editing-gate.js allowed from hook-runner"
else
  fail "legitimate edit should pass: $OUTPUT"
fi

# 16. T598: Block message includes actionable steps (TODO.md path + session launch)
run_gate_other_full() {
  local tool="$1"
  local file_path="$2"
  local content="$3"
  local input
  if [ "$tool" = "Write" ]; then
    input="{\"file_path\":\"$file_path\",\"content\":$(echo "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
  else
    input="{\"file_path\":\"$file_path\",\"new_string\":$(echo "$content" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync(0,'utf-8')))")}"
  fi
  CLAUDE_PROJECT_DIR="/tmp/some-other-project" node -e "
    var mod = require('$MODULE');
    var result = mod({ tool_name: '$tool', tool_input: JSON.parse(process.argv[1]) });
    if (result && result.decision === 'block') {
      process.stdout.write(result.reason);
      process.exit(1);
    } else {
      process.stdout.write('PASSED');
    }
  " "$input" 2>&1 || true
}
OUTPUT=$(run_gate_other_full "Edit" "$HOOKS_DIR/run-modules/PreToolUse/some.js" "var x = 1;")
if echo "$OUTPUT" | grep -q "NEXT STEPS:" || echo "$OUTPUT" | grep -q "WHY:"; then
  pass "block message has standard format (WHY/NEXT STEPS)"
else
  fail "block message should include actionable steps: $OUTPUT"
fi

# 17. T413: other projects still blocked from editing hook-editing-gate.js
OUTPUT=$(run_gate_other "Edit" "$HOOKS_DIR/run-modules/PreToolUse/hook-editing-gate.js" "$LEGIT_EDIT")
if echo "$OUTPUT" | grep -q "BLOCKED.*hook-runner"; then
  pass "other projects blocked from editing hook-editing-gate.js"
else
  fail "other project should be blocked: $OUTPUT"
fi

# 18. T600: hook-runner blocked from editing settings.json in OTHER projects
FOREIGN_SETTINGS="$HOME/Documents/ProjectsCL1/_tmemu/lab-worker/.claude/settings.json"
OUTPUT=$(run_gate "Write" "$FOREIGN_SETTINGS" '{"hooks":{}}')
if echo "$OUTPUT" | grep -q "BLOCKED.*Cannot edit settings.json in another project"; then
  pass "hook-runner blocked from editing foreign project settings.json"
else
  fail "foreign settings.json should be blocked: $OUTPUT"
fi

# 19. T600: hook-runner CAN edit ~/.claude/settings.json (home dir)
OUTPUT=$(run_gate "Edit" "$HOME/.claude/settings.json" '"hooks": {}')
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "hook-runner can edit home dir settings.json"
else
  fail "home settings.json should pass: $OUTPUT"
fi

# 20. T600: hook-runner CAN edit its own .claude/settings.json
OUTPUT=$(run_gate "Edit" "$REPO_DIR/.claude/settings.json" '"hooks": {}')
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "hook-runner can edit its own .claude/settings.json"
else
  fail "own settings.json should pass: $OUTPUT"
fi

# 21. T635: Writing UPS hooks to OWN settings.json is blocked (any project)
UPS_CONTENT='{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"echo hi"}]}]}}'
OUTPUT=$(run_gate "Write" "$REPO_DIR/.claude/settings.json" "$UPS_CONTENT")
if echo "$OUTPUT" | grep -q "BLOCKED.*UserPromptSubmit"; then
  pass "T635: UPS hooks in own settings.json blocked (hook-runner project)"
else
  fail "T635: UPS in own settings.json should block: $OUTPUT"
fi

# 22. T635: Writing UPS hooks to home settings.json is blocked
OUTPUT=$(run_gate "Write" "$HOME/.claude/settings.json" "$UPS_CONTENT")
if echo "$OUTPUT" | grep -q "BLOCKED.*UserPromptSubmit"; then
  pass "T635: UPS hooks in home settings.json blocked"
else
  fail "T635: UPS in home settings.json should block: $OUTPUT"
fi

# 23. T635: Edit adding UPS content to settings.json is blocked
UPS_EDIT='"UserPromptSubmit": [{"hooks": [{"type": "command", "command": "python check.py"}]}]'
OUTPUT=$(run_gate "Edit" "$REPO_DIR/.claude/settings.json" "$UPS_EDIT")
if echo "$OUTPUT" | grep -q "BLOCKED.*UserPromptSubmit"; then
  pass "T635: Edit adding UPS content to settings.json blocked"
else
  fail "T635: Edit adding UPS should block: $OUTPUT"
fi

# 24. T635: Non-UPS settings.json writes still pass (from hook-runner)
SAFE_CONTENT='{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"echo hi"}]}]}}'
OUTPUT=$(run_gate "Write" "$REPO_DIR/.claude/settings.json" "$SAFE_CONTENT")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "T635: Non-UPS settings.json write passes"
else
  fail "T635: Non-UPS settings.json should pass: $OUTPUT"
fi

# --- T618: Bash in-place edit detection ---
run_bash_gate() {
  local cmd="$1"
  local project="${2:-/tmp/some-other-project}"
  CLAUDE_PROJECT_DIR="$project" node -e "
    var mod = require('$MODULE');
    var result = mod({ tool_name: 'Bash', tool_input: { command: process.argv[1] } });
    if (result && result.decision === 'block') {
      process.stdout.write('BLOCKED');
      process.exit(1);
    } else {
      process.stdout.write('PASSED');
    }
  " "$cmd" 2>&1 || true
}

# 25. T618: sed -i on hook file blocked (other project)
OUTPUT=$(run_bash_gate "sed -i 's/old/new/' ~/.claude/hooks/run-modules/PreToolUse/gate.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T618: sed -i on hook file blocked"
else
  fail "T618: sed -i should block: $OUTPUT"
fi

# 26. T618: perl -i on hook file blocked
OUTPUT=$(run_bash_gate "perl -i -pe 's/old/new/' ~/.claude/hooks/run-modules/PreToolUse/gate.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T618: perl -i on hook file blocked"
else
  fail "T618: perl -i should block: $OUTPUT"
fi

# 27. T618: tee to hook file blocked
OUTPUT=$(run_bash_gate "echo 'bad' | tee ~/.claude/hooks/run-modules/PreToolUse/gate.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T618: tee to hook file blocked"
else
  fail "T618: tee should block: $OUTPUT"
fi

# 28. T618: redirect to hook file blocked
OUTPUT=$(run_bash_gate "echo 'bad' > ~/.claude/hooks/run-modules/PreToolUse/gate.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T618: redirect to hook file blocked"
else
  fail "T618: redirect should block: $OUTPUT"
fi

# 29. T618: cat redirect to hook file blocked
OUTPUT=$(run_bash_gate "cat /tmp/src.js > ~/.claude/hooks/run-modules/Stop/gate.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T618: cat redirect to hook file blocked"
else
  fail "T618: cat redirect should block: $OUTPUT"
fi

# 30. T618: cp to hooks still blocked (regression check)
OUTPUT=$(run_bash_gate "cp /tmp/src.js ~/.claude/hooks/run-modules/PreToolUse/gate.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T618: cp to hooks still blocked"
else
  fail "T618: cp should still block: $OUTPUT"
fi

# 31. T618: normal sed on non-hook file passes
OUTPUT=$(run_bash_gate "sed -i 's/old/new/' /tmp/myfile.js")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "T618: sed on non-hook file passes"
else
  fail "T618: non-hook sed should pass: $OUTPUT"
fi

# 32. T618: Bash commands from hook-runner project allowed
OUTPUT=$(run_bash_gate "sed -i 's/old/new/' ~/.claude/hooks/run-modules/PreToolUse/gate.js" "$REPO_DIR")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "T618: sed from hook-runner project allowed"
else
  fail "T618: hook-runner sed should pass: $OUTPUT"
fi

# --- T767b: Re-entrant guard protection (stop_hook_active + exit code) ---

# 33. T767b: Edit with exit(0) near stop_hook_active passes (correct re-entrant guard)
REENTRANT_OK='if (input.stop_hook_active) {
  process.exit(0);
}'
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-stop.js" "$REENTRANT_OK")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "T767b: exit(0) near stop_hook_active passes (correct)"
else
  fail "T767b: exit(0) + stop_hook_active should pass: $OUTPUT"
fi

# 34. T767b: Edit changing re-entrant guard to exit(1) is blocked
REENTRANT_BAD='if (input.stop_hook_active) {
  process.exit(1);
}'
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-stop.js" "$REENTRANT_BAD")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T767b: exit(1) near stop_hook_active blocked (infinite loop prevention)"
else
  fail "T767b: exit(1) + stop_hook_active should block: $OUTPUT"
fi

# 35. T767b: Write full run-stop.js with exit(1) near stop_hook_active blocked
FULL_STOP_BAD='#!/usr/bin/env node
"use strict";
var input = JSON.parse(require("fs").readFileSync(0, "utf-8"));
if (input.stop_hook_active) {
  process.exit(1);
}
// rest of runner
process.exit(1);'
OUTPUT=$(run_gate "Write" "$HOOKS_DIR/run-stop.js" "$FULL_STOP_BAD")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T767b: Write full run-stop.js with exit(1) at re-entrant blocked"
else
  fail "T767b: full write with exit(1) at re-entrant should block: $OUTPUT"
fi

# 36. T767b: Write full run-stop.js with exit(0) at re-entrant passes
FULL_STOP_OK='// WORKFLOW: shtd
// WHY: Stop runner
#!/usr/bin/env node
"use strict";
var input = JSON.parse(require("fs").readFileSync(0, "utf-8"));
if (input.stop_hook_active) {
  process.exit(0);
}
process.exit(1);'
OUTPUT=$(run_gate "Write" "$HOOKS_DIR/run-stop.js" "$FULL_STOP_OK")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "T767b: Write full run-stop.js with exit(0) at re-entrant passes"
else
  fail "T767b: full write with exit(0) at re-entrant should pass: $OUTPUT"
fi

# 37. T767b: exit(0) without stop_hook_active still blocked (T759)
EXIT0_NO_REENTRANT='process.exit(0);'
OUTPUT=$(run_gate "Edit" "$HOOKS_DIR/run-modules/Stop/1-haiku/auto-continue-gate.js" "$EXIT0_NO_REENTRANT")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T767b: exit(0) without stop_hook_active still blocked (T759)"
else
  fail "T767b: exit(0) without stop_hook_active should block: $OUTPUT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
