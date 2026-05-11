#!/usr/bin/env bash
# WHY: T655 — verify tool-event-guard emits tool.used events and is no-op without env var
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== hook-runner: tool-event-guard (T655) ==="
MOD="modules/PostToolUse/tool-event-guard.js"
PASS=0; FAIL=0
TMPDIR_TEST="${TMPDIR:-/tmp}/hook-t655-$$"
trap 'rm -rf "$TMPDIR_TEST"' EXIT
mkdir -p "$TMPDIR_TEST"

assert() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"; PASS=$((PASS+1))
  else
    echo "  FAIL: $desc (expected=$expected, got=$actual)"; FAIL=$((FAIL+1))
  fi
}

# Test: module exports a function
node -e "var m=require('./$MOD'); if(typeof m!=='function') process.exit(1)" 2>/dev/null
assert "module exports function" "0" "$?"

# Test: returns null (async)
R=$(node -e "
  var m=require('./$MOD');
  Promise.resolve(m({tool_name:'Bash',tool_input:{command:'echo hi'}})).then(function(r){
    console.log(r===null?'null':'other');
  });
" 2>/dev/null)
assert "returns null" "null" "$R"

# Test: no-op when CLAUDE_EVENT_LOG unset
LOG_FILE="$TMPDIR_TEST/events.jsonl"
R=$(CLAUDE_EVENT_LOG="" node -e "
  var m=require('./$MOD');
  Promise.resolve(m({tool_name:'Bash',tool_input:{command:'echo hi'}})).then(function(){
    console.log('done');
  });
" 2>/dev/null)
assert "no-op when env unset" "done" "$R"
[ ! -f "$LOG_FILE" ]
assert "no file created when env unset" "0" "$?"

# Test: emits event when CLAUDE_EVENT_LOG set
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" node -e "
  var m=require('./$MOD');
  Promise.resolve(m({tool_name:'Bash',tool_input:{command:'git diff --staged'}})).then(function(){
    var fs=require('fs');
    var line=fs.readFileSync('$LOG_FILE','utf-8').trim();
    var ev=JSON.parse(line);
    console.log(ev.event + '|' + ev.tool + '|' + ev.source);
  });
" 2>/dev/null)
assert "emits tool.used event" "tool.used|Bash|hook-runner" "$R"

# Test: command truncated at 200 chars
LONG_CMD=$(python3 -c "print('x' * 300)")
rm -f "$LOG_FILE"
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" node -e "
  var m=require('./$MOD');
  Promise.resolve(m({tool_name:'Bash',tool_input:{command:'$LONG_CMD'}})).then(function(){
    var fs=require('fs');
    var ev=JSON.parse(fs.readFileSync('$LOG_FILE','utf-8').trim());
    console.log(ev.command.length);
  });
" 2>/dev/null)
assert "command truncated at 200" "200" "$R"

# Test: includes task_id and stage from env
rm -f "$LOG_FILE"
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" CURRENT_TASK_ID="task-5" CURRENT_STAGE="IMPLEMENT" node -e "
  var m=require('./$MOD');
  Promise.resolve(m({tool_name:'Edit',tool_input:{file_path:'/app/main.js'}})).then(function(){
    var fs=require('fs');
    var ev=JSON.parse(fs.readFileSync('$LOG_FILE','utf-8').trim());
    console.log(ev.task_id + '|' + ev.stage + '|' + ev.tool + '|' + ev.command);
  });
" 2>/dev/null)
assert "includes task_id and stage" "task-5|IMPLEMENT|Edit|/app/main.js" "$R"

# Test: includes worker_id from env
rm -f "$LOG_FILE"
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" WORKER_ID="ccc-worker-1" node -e "
  var m=require('./$MOD');
  Promise.resolve(m({tool_name:'Bash',tool_input:{command:'ls'}})).then(function(){
    var fs=require('fs');
    var ev=JSON.parse(fs.readFileSync('$LOG_FILE','utf-8').trim());
    console.log(ev.worker_id);
  });
" 2>/dev/null)
assert "includes worker_id" "ccc-worker-1" "$R"

# Test: log rotation at 10MB
rm -f "$LOG_FILE" "${LOG_FILE}.1"
python3 -c "
with open('$LOG_FILE', 'w') as f:
    f.write('x' * (10 * 1024 * 1024 + 1))
"
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" node -e "
  var m=require('./$MOD');
  Promise.resolve(m({tool_name:'Bash',tool_input:{command:'echo rotated'}})).then(function(){
    var fs=require('fs');
    console.log(fs.existsSync('${LOG_FILE}.1') ? 'rotated' : 'no-rotation');
  });
" 2>/dev/null)
assert "log rotation at 10MB" "rotated" "$R"

# Test: multiple events append
rm -f "$LOG_FILE"
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" node -e "
  var m=require('./$MOD');
  Promise.resolve(m({tool_name:'Bash',tool_input:{command:'cmd1'}})).then(function(){
    return m({tool_name:'Edit',tool_input:{file_path:'/a.js'}});
  }).then(function(){
    var fs=require('fs');
    var lines=fs.readFileSync('$LOG_FILE','utf-8').trim().split('\n');
    console.log(lines.length);
  });
" 2>/dev/null)
assert "multiple events append" "2" "$R"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
