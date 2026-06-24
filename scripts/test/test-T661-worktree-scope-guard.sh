#!/usr/bin/env bash
# T661: Test worktree-scope-guard-gate
set -euo pipefail
cd "$(dirname "$0")/../.."

PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== hook-runner: Worktree scope guard (T661) ==="

GATE="modules/PreToolUse/worktree-scope-guard-gate.js"

# --- Structural ---
[ -f "$GATE" ] && pass "Gate exists" || fail "Gate missing"
grep -q "// TOOLS: EnterWorktree" "$GATE" && pass "TOOLS tag" || fail "Missing TOOLS"
grep -q "// WORKFLOW: haiku-rules" "$GATE" && pass "WORKFLOW tag" || fail "Missing WORKFLOW"
grep -q "// WHY:" "$GATE" && pass "WHY comment" || fail "Missing WHY"
grep -q "_log(" "$GATE" && pass "Logging" || fail "Missing logging"

# --- Functional ---
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT
echo "- [ ] T661 worktree scope guard
- [ ] T667 architecture redesign" > "$TMPDIR/TODO.md"

# Skips non-EnterWorktree
RESULT=$(HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'Bash', tool_input:{command:'echo'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "Skips non-EnterWorktree" || fail "Didn't skip: $RESULT"

# Passes when no name (auto-generated)
RESULT=$(HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'EnterWorktree', tool_input:{}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "Passes with no name (auto)" || fail "Blocked auto: $RESULT"

# Passes when name contains project name
RESULT=$(CLAUDE_PROJECT_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 node -e "
  var path = require('path');
  var projName = path.basename('$TMPDIR');
  var gate = require('./$GATE');
  var r = gate({tool_name:'EnterWorktree', tool_input:{name: projName + '-feature'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "Passes when name contains project" || fail "Blocked project name: $RESULT"

# Passes when name matches TODO word
RESULT=$(CLAUDE_PROJECT_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'EnterWorktree', tool_input:{name:'worktree-scope'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "Passes when name matches TODO word" || fail "Blocked TODO word: $RESULT"

# Passes when name is a task ID from TODO
RESULT=$(CLAUDE_PROJECT_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'EnterWorktree', tool_input:{name:'t661-fix'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "Passes for task ID t661" || fail "Blocked task ID: $RESULT"

# Blocks unrelated worktree name
RESULT=$(CLAUDE_PROJECT_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'EnterWorktree', tool_input:{name:'ad-exchange-spec'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "block" ] && pass "Blocks unrelated 'ad-exchange-spec'" || fail "Didn't block: $RESULT"

# Blocks another unrelated name
RESULT=$(CLAUDE_PROJECT_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'EnterWorktree', tool_input:{name:'kubernetes-deploy'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "block" ] && pass "Blocks unrelated 'kubernetes-deploy'" || fail "Didn't block: $RESULT"

# Block message is helpful
RESULT=$(CLAUDE_PROJECT_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE');
  var r = gate({tool_name:'EnterWorktree', tool_input:{name:'random-stuff'}});
  process.stdout.write(r ? r.reason : 'null');
")
echo "$RESULT" | grep -qi "BLOCKED\|drift\|worktree\|scope" && pass "Block message has useful content" || fail "Unhelpful message"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
