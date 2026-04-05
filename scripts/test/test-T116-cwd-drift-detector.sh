#!/usr/bin/env bash
# WHY: T116 — verify cwd-drift-detector blocks cross-project access and allows exceptions
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== hook-runner: cwd-drift-detector ==="
MOD="modules/PreToolUse/cwd-drift-detector.js"
PASS=0; FAIL=0
# Use current directory as project dir for portable testing
PROJECT_DIR="$(pwd -W 2>/dev/null || pwd)"
PROJECT_DIR="${PROJECT_DIR//\\//}"
# Derive parent as projects root
PROJECTS_ROOT="$(dirname "$PROJECT_DIR")"
# A fake other-project under the same root
OTHER_PROJECT="$PROJECTS_ROOT/other-project"

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"; FAIL=$((FAIL+1))
  fi
}

# Helper: run module with inline Node script
run_mod() {
  local tool_name="$1" key="$2" val="$3"
  local out
  out=$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
    node -e "
      var mod = require('./$MOD');
      var inp = {tool_name: '$tool_name', tool_input: {}};
      inp.tool_input['$key'] = '$val';
      var r = mod(inp);
      console.log(r && r.decision === 'block' ? 'block' : 'pass');
    " 2>/dev/null) || true
  echo "$out"
}

# Test: module exports a function
node -e "var m=require('./$MOD'); if(typeof m!=='function') process.exit(1)" 2>/dev/null
assert "module exports function" "0" "$?"

# Test: same-project access → pass
R=$(run_mod Edit file_path "$PROJECT_DIR/setup.js")
assert "same-project Edit passes" "pass" "$R"

# Test: cross-project access → block
R=$(run_mod Edit file_path "$OTHER_PROJECT/index.js")
assert "cross-project Edit blocks" "block" "$R"

# Test: cross-project Read → block
R=$(run_mod Read file_path "$OTHER_PROJECT/foo.txt")
assert "cross-project Read blocks" "block" "$R"

# Test: cross-project Bash cd → block
R=$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  node -e "
    var mod = require('./$MOD');
    var r = mod({tool_name:'Bash',tool_input:{command:'cd $OTHER_PROJECT && ls'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "cross-project Bash cd blocks" "block" "$R"

# Test: TODO.md write to other project → pass (allowed exception)
R=$(run_mod Write file_path "$OTHER_PROJECT/TODO.md")
assert "cross-project TODO.md write passes" "pass" "$R"

# Test: SESSION_STATE.md write → pass (allowed exception)
R=$(run_mod Write file_path "$OTHER_PROJECT/SESSION_STATE.md")
assert "cross-project SESSION_STATE.md write passes" "pass" "$R"

# Test: context-reset command → pass (allowed exception)
R=$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  node -e "
    var mod = require('./$MOD');
    var r = mod({tool_name:'Bash',tool_input:{command:'python $PROJECTS_ROOT/context-reset/context_reset.py --project-dir /foo'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "context-reset command passes" "pass" "$R"

# Test: no target path (e.g. bare Bash echo) → pass
R=$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  node -e "
    var mod = require('./$MOD');
    var r = mod({tool_name:'Bash',tool_input:{command:'echo hello'}});
    console.log(r && r.decision === 'block' ? 'block' : 'pass');
  " 2>/dev/null) || true
assert "no-path Bash passes" "pass" "$R"

# Test: skills directory cross-access → block
HOME_DIR="$(node -e "console.log(require('os').homedir().replace(/\\\\/g,'/'))")"
R=$(run_mod Edit file_path "$HOME_DIR/.claude/skills/some-other-skill/SKILL.md")
assert "cross-skill Edit blocks" "block" "$R"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
