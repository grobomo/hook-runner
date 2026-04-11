#!/usr/bin/env bash
# WHY: T408 — test cpt-gate for false positives on workflow names.
set -euo pipefail
echo "=== hook-runner: cpt-gate ==="
PASS=0; FAIL=0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MODULE="$ROOT/modules/PreToolUse/cross-project-todo-gate.js"

run_test() {
  local desc="$1" expected="$2" new_string="$3"
  local result
  result=$(CLAUDE_PROJECT_DIR="$ROOT" node -e "
    var mod = require(process.argv[1]);
    var r = mod({
      tool_name: 'Edit',
      tool_input: {
        file_path: process.env.CLAUDE_PROJECT_DIR + '/TODO.md',
        new_string: process.argv[2]
      }
    });
    console.log(r ? 'block' : 'pass');
  " "$MODULE" "$new_string" 2>/dev/null) || result="error"

  if [ "$result" = "$expected" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected=$expected got=$result)"
    FAIL=$((FAIL + 1))
  fi
}

# Should block: standalone phrase
run_test "blocks standalone phrase" "block" \
  "- [ ] T999: This is a cross-project task"

# Should pass: hyphenated workflow name
run_test "passes workflow name with suffix" "pass" \
  "- [ ] T999: Remove stale entry from cross-project-reset workflow"

# Should pass: hyphenated module name
run_test "passes module name cpt-gate" "pass" \
  "- [ ] T999: Fix false positive in cross-project-todo-gate"

# Should block: phrase at end of line
run_test "blocks phrase at EOL" "block" \
  "- [ ] T999: This work is cross-project"

# Should block: capitalized
run_test "blocks capitalized" "block" \
  "- [ ] T999: Cross-project sync needed"

# Should pass: completed items (not unchecked)
run_test "passes completed items" "pass" \
  "- [x] T999: Cross-project sync done"

# Should pass: non-TODO prose
run_test "passes non-TODO prose" "pass" \
  "Cross-project items should go elsewhere"

# Should pass: empty content
run_test "passes empty content" "pass" \
  ""

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
