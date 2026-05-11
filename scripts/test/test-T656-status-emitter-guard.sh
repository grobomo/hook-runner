#!/usr/bin/env bash
# WHY: T656 — verify status-emitter-guard emits claude.stopped events and is no-op without env var
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== hook-runner: status-emitter-guard (T656) ==="
MOD="modules/Stop/status-emitter-guard.js"
PASS=0; FAIL=0
TMPDIR_TEST="${TMPDIR:-/tmp}/hook-t656-$$"
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

# Test: returns null (sync)
R=$(node -e "
  var m=require('./$MOD');
  var r=m({});
  console.log(r===null?'null':'other');
" 2>/dev/null)
assert "returns null" "null" "$R"

# Test: no-op when CLAUDE_EVENT_LOG unset
LOG_FILE="$TMPDIR_TEST/events.jsonl"
R=$(CLAUDE_EVENT_LOG="" node -e "
  var m=require('./$MOD');
  m({});
  console.log('done');
" 2>/dev/null)
assert "no-op when env unset" "done" "$R"
[ ! -f "$LOG_FILE" ]
assert "no file created when env unset" "0" "$?"

# Test: emits claude.stopped event
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" node -e "
  var m=require('./$MOD');
  m({stop_hook_reason:'task completed'});
  var fs=require('fs');
  var ev=JSON.parse(fs.readFileSync('$LOG_FILE','utf-8').trim());
  console.log(ev.event + '|' + ev.source + '|' + ev.detail);
" 2>/dev/null)
assert "emits claude.stopped event" "claude.stopped|hook-runner|task completed" "$R"

# Test: includes task_id and stage
rm -f "$LOG_FILE"
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" CURRENT_TASK_ID="task-7" CURRENT_STAGE="VERIFY" node -e "
  var m=require('./$MOD');
  m({reason:'auto-continuing'});
  var fs=require('fs');
  var ev=JSON.parse(fs.readFileSync('$LOG_FILE','utf-8').trim());
  console.log(ev.task_id + '|' + ev.stage + '|' + ev.detail);
" 2>/dev/null)
assert "includes task_id and stage" "task-7|VERIFY|auto-continuing" "$R"

# Test: includes worker_id
rm -f "$LOG_FILE"
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" WORKER_ID="ccc-worker-2" node -e "
  var m=require('./$MOD');
  m({});
  var fs=require('fs');
  var ev=JSON.parse(fs.readFileSync('$LOG_FILE','utf-8').trim());
  console.log(ev.worker_id);
" 2>/dev/null)
assert "includes worker_id" "ccc-worker-2" "$R"

# Test: handles missing stop reason
rm -f "$LOG_FILE"
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" node -e "
  var m=require('./$MOD');
  m({});
  var fs=require('fs');
  var ev=JSON.parse(fs.readFileSync('$LOG_FILE','utf-8').trim());
  console.log(ev.detail);
" 2>/dev/null)
assert "handles missing stop reason" "unknown" "$R"

# Test: log rotation at 10MB
rm -f "$LOG_FILE" "${LOG_FILE}.1"
python3 -c "
with open('$LOG_FILE', 'w') as f:
    f.write('x' * (10 * 1024 * 1024 + 1))
"
R=$(CLAUDE_EVENT_LOG="$LOG_FILE" node -e "
  var m=require('./$MOD');
  m({reason:'rotated'});
  var fs=require('fs');
  console.log(fs.existsSync('${LOG_FILE}.1') ? 'rotated' : 'no-rotation');
" 2>/dev/null)
assert "log rotation at 10MB" "rotated" "$R"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
