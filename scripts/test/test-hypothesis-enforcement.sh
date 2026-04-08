#!/usr/bin/env bash
# WHY: T004 — verify hypothesis-throttle, hypothesis-failure-tracker, and no-prose-enforcement
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== hook-runner: hypothesis enforcement ==="
THROTTLE="modules/PreToolUse/ddei-email-security/hypothesis-throttle.js"
TRACKER="modules/PostToolUse/ddei-email-security/hypothesis-failure-tracker.js"
PROSE="modules/PreToolUse/no-prose-enforcement.js"
REVIEW="modules/Stop/ddei-email-security/report-review-gate.js"
PASS=0; FAIL=0

PROJECT_DIR="$(pwd -W 2>/dev/null || pwd)"
PROJECT_DIR="${PROJECT_DIR//\\//}"

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"; FAIL=$((FAIL+1))
  fi
}

# --- hypothesis-throttle tests ---
echo ""
echo "--- hypothesis-throttle ---"

# Test: module exports function
node -e "var m=require('./$THROTTLE'); if(typeof m!=='function') process.exit(1)" 2>/dev/null
assert "throttle exports function" "0" "$?"

# Test: non-infra command passes
R=$(CLAUDE_PROJECT_DIR="${PROJECT_DIR/hook-runner/ddei-email-security}" \
  node -e "
    var mod = require('./$THROTTLE');
    var r = mod({tool_name:'Bash', tool_input:{command:'git status'}, _git:{branch:'feat'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "non-infra command passes" "pass" "$R"

# Test: wrong project passes
R=$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  node -e "
    var mod = require('./$THROTTLE');
    var r = mod({tool_name:'Bash', tool_input:{command:'az vm list'}, _git:{branch:'feat'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "wrong project passes" "pass" "$R"

# Test: infra command under threshold passes (use temp dir as ddei project)
FAKE_DDEI=$(mktemp -d)
FAKE_DDEI="${FAKE_DDEI//\\//}"
# Rename to include ddei-email-security
DDEI_DIR="$FAKE_DDEI/ddei-email-security"
mkdir -p "$DDEI_DIR/.claude"
trap "rm -rf '$FAKE_DDEI'" EXIT

R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" CLAUDE_SESSION_ID="test-session-$$" \
  node -e "
    var mod = require('./$THROTTLE');
    var r = mod({tool_name:'Bash', tool_input:{command:'az vm list'}, _git:{branch:'feat'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "first infra command passes" "pass" "$R"

# Test: 9th infra command blocks (write state with 8 already)
cat > "$DDEI_DIR/.claude/hypothesis-state.json" <<'STEOF'
{"session_id":"test-session-throttle","infra_commands":8,"failures":0,"last_hypothesis_mtime":0}
STEOF
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" CLAUDE_SESSION_ID="test-session-throttle" \
  node -e "
    var mod = require('./$THROTTLE');
    var r = mod({tool_name:'Bash', tool_input:{command:'az vm run-command invoke'}, _git:{branch:'main'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "9th infra command on main blocks" "block" "$R"

# Test: on feature branch, 9th passes (not at reminder interval)
cat > "$DDEI_DIR/.claude/hypothesis-state.json" <<'STEOF'
{"session_id":"test-session-feat","infra_commands":8,"failures":0,"last_hypothesis_mtime":0}
STEOF
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" CLAUDE_SESSION_ID="test-session-feat" \
  node -e "
    var mod = require('./$THROTTLE');
    var r = mod({tool_name:'Bash', tool_input:{command:'az vm list'}, _git:{branch:'my-feature'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "9th on feature branch passes (not at interval)" "pass" "$R"

# Test: 13th command on feature branch blocks (5 past threshold = reminder)
cat > "$DDEI_DIR/.claude/hypothesis-state.json" <<'STEOF'
{"session_id":"test-session-remind","infra_commands":12,"failures":0,"last_hypothesis_mtime":0}
STEOF
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" CLAUDE_SESSION_ID="test-session-remind" \
  node -e "
    var mod = require('./$THROTTLE');
    var r = mod({tool_name:'Bash', tool_input:{command:'az vm list'}, _git:{branch:'my-feature'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "13th on feature branch blocks (reminder interval)" "block" "$R"

# Test: 2 failures blocks
cat > "$DDEI_DIR/.claude/hypothesis-state.json" <<'STEOF'
{"session_id":"test-session-fail","infra_commands":3,"failures":2,"last_hypothesis_mtime":0}
STEOF
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" CLAUDE_SESSION_ID="test-session-fail" \
  node -e "
    var mod = require('./$THROTTLE');
    var r = mod({tool_name:'Bash', tool_input:{command:'ssh user@host'}, _git:{branch:'feat'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "2 failures blocks" "block" "$R"

# Test: new session resets counters
cat > "$DDEI_DIR/.claude/hypothesis-state.json" <<'STEOF'
{"session_id":"old-session","infra_commands":20,"failures":5,"last_hypothesis_mtime":0}
STEOF
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" CLAUDE_SESSION_ID="new-session-$$" \
  node -e "
    var mod = require('./$THROTTLE');
    var r = mod({tool_name:'Bash', tool_input:{command:'az vm list'}, _git:{branch:'feat'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "new session resets counters" "pass" "$R"

# --- hypothesis-failure-tracker tests ---
echo ""
echo "--- hypothesis-failure-tracker ---"

# Test: module exports function
node -e "var m=require('./$TRACKER'); if(typeof m!=='function') process.exit(1)" 2>/dev/null
assert "tracker exports function" "0" "$?"

# Test: failed infra command increments failures
cat > "$DDEI_DIR/.claude/hypothesis-state.json" <<'STEOF'
{"session_id":"test","infra_commands":3,"failures":0,"last_hypothesis_mtime":0}
STEOF
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" \
  node -e "
    var mod = require('./$TRACKER');
    var path = require('path');
    mod({tool_name:'Bash', tool_input:{command:'az vm run-command invoke'}, tool_result:{exit_code:1}});
    var fs = require('fs');
    var sf = path.join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'hypothesis-state.json');
    var state = JSON.parse(fs.readFileSync(sf,'utf-8'));
    console.log(state.failures);
  " 2>/dev/null) || true
assert "failed infra increments failures" "1" "$R"

# Test: successful command doesn't increment
cat > "$DDEI_DIR/.claude/hypothesis-state.json" <<'STEOF'
{"session_id":"test","infra_commands":3,"failures":0,"last_hypothesis_mtime":0}
STEOF
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" \
  node -e "
    var mod = require('./$TRACKER');
    var path = require('path');
    mod({tool_name:'Bash', tool_input:{command:'az vm list'}, tool_result:{exit_code:0}});
    var fs = require('fs');
    var sf = path.join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'hypothesis-state.json');
    var state = JSON.parse(fs.readFileSync(sf,'utf-8'));
    console.log(state.failures);
  " 2>/dev/null) || true
assert "success doesn't increment" "0" "$R"

# Test: non-infra failure ignored
cat > "$DDEI_DIR/.claude/hypothesis-state.json" <<'STEOF'
{"session_id":"test","infra_commands":3,"failures":0,"last_hypothesis_mtime":0}
STEOF
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" \
  node -e "
    var mod = require('./$TRACKER');
    var path = require('path');
    mod({tool_name:'Bash', tool_input:{command:'git push'}, tool_result:{exit_code:1}});
    var fs = require('fs');
    var sf = path.join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'hypothesis-state.json');
    var state = JSON.parse(fs.readFileSync(sf,'utf-8'));
    console.log(state.failures);
  " 2>/dev/null) || true
assert "non-infra failure ignored" "0" "$R"

# --- no-prose-enforcement tests ---
echo ""
echo "--- no-prose-enforcement ---"

# Test: module exports function
node -e "var m=require('./$PROSE'); if(typeof m!=='function') process.exit(1)" 2>/dev/null
assert "prose gate exports function" "0" "$?"

# Test: factual content passes
R=$(node -e "
  var mod = require('./$PROSE');
  var r = mod({tool_name:'Write', tool_input:{
    file_path:'/project/CLAUDE.md',
    content:'# Architecture\nJumpbox IP: 10.0.0.1\nVersion: 2.17.0\nThe hook always returns null on pass.'
  }});
  console.log(r && r.decision === 'block' ? 'block' : 'pass');
" 2>/dev/null) || true
assert "factual content passes" "pass" "$R"

# Test: enforcement prose blocks
R=$(node -e "
  var mod = require('./$PROSE');
  var r = mod({tool_name:'Write', tool_input:{
    file_path:'/project/CLAUDE.md',
    content:'Always verify RDP before deploying.\nNever run az commands without checking quota.\nMust update TODO.md after every change.\nDo not push without running tests.'
  }});
  console.log(r && r.decision === 'block' ? 'block' : 'pass');
" 2>/dev/null) || true
assert "enforcement prose blocks" "block" "$R"

# Test: 2 or fewer enforcement lines pass (threshold is >2)
R=$(node -e "
  var mod = require('./$PROSE');
  var r = mod({tool_name:'Write', tool_input:{
    file_path:'/project/.claude/rules/test.md',
    content:'# Rule\nAlways check before pushing.\nThe system uses hooks for enforcement.'
  }});
  console.log(r && r.decision === 'block' ? 'block' : 'pass');
" 2>/dev/null) || true
assert "2 enforcement lines passes (threshold >2)" "pass" "$R"

# Test: non-target file passes
R=$(node -e "
  var mod = require('./$PROSE');
  var r = mod({tool_name:'Write', tool_input:{
    file_path:'/project/src/index.js',
    content:'Always verify before deploying. Never skip tests. Must check. Do not forget.'
  }});
  console.log(r && r.decision === 'block' ? 'block' : 'pass');
" 2>/dev/null) || true
assert "non-target file passes" "pass" "$R"

# Test: Edit with enforcement new_string blocks
R=$(node -e "
  var mod = require('./$PROSE');
  var r = mod({tool_name:'Edit', tool_input:{
    file_path:'/project/CLAUDE.md',
    new_string:'Always run tests first.\nNever deploy on Friday.\nMust update changelog.\nDo not skip code review.'
  }});
  console.log(r && r.decision === 'block' ? 'block' : 'pass');
" 2>/dev/null) || true
assert "Edit enforcement blocks" "block" "$R"

# --- report-review-gate tests ---
echo ""
echo "--- report-review-gate ---"

# Test: module exports function
node -e "var m=require('./$REVIEW'); if(typeof m!=='function') process.exit(1)" 2>/dev/null
assert "review gate exports function" "0" "$?"

# Test: wrong project passes
R=$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  node -e "
    var mod = require('./$REVIEW');
    var r = mod({});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "wrong project passes" "pass" "$R"

# Test: no test-results dir passes
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" \
  node -e "
    var mod = require('./$REVIEW');
    var r = mod({});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "no test-results dir passes" "pass" "$R"

# Test: recent PDF without review notes blocks
mkdir -p "$DDEI_DIR/test-results"
touch "$DDEI_DIR/test-results/deployment_report_2026-04-08.pdf"
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" \
  node -e "
    var mod = require('./$REVIEW');
    var r = mod({});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "recent PDF without review notes blocks" "block" "$R"

# Test: with incomplete review notes blocks
echo -e "## Pass 1\nok\n## Pass 2\nok" > "$DDEI_DIR/test-results/review-notes-2026-04-08.md"
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" \
  node -e "
    var mod = require('./$REVIEW');
    var r = mod({});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "incomplete review notes blocks" "block" "$R"

# Test: with complete review notes passes
echo -e "## Pass 1\nok\n## Pass 2\nok\n## Pass 3\nok\n## Pass 4\nok\n## Pass 5\nok" > "$DDEI_DIR/test-results/review-notes-2026-04-08.md"
R=$(CLAUDE_PROJECT_DIR="$DDEI_DIR" \
  node -e "
    var mod = require('./$REVIEW');
    var r = mod({});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "complete review notes passes" "pass" "$R"

# --- Summary ---
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
