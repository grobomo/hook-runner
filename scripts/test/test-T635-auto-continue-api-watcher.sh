#!/usr/bin/env bash
# T635: Test auto-continue.js API error detection and watcher spawn
set -uo pipefail
cd "$(dirname "$0")/../.."
PASS=0; FAIL=0
check() {
  if eval "$2" 2>/dev/null; then
    echo "OK: $1"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $1"
    FAIL=$((FAIL + 1))
  fi
}

MOD="modules/Stop/auto-continue.js"
TMPDIR_T=$(mktemp -d)
FAKE_PROJECT="$TMPDIR_T/project"
LOCK="$TMPDIR_T/api-check-watcher.lock"
FAKE_SCRIPT="$TMPDIR_T/api_check.py"

mkdir -p "$FAKE_PROJECT"

# Create a fake api_check.py that just touches a marker file
cat > "$FAKE_SCRIPT" << 'PY'
#!/usr/bin/env python3
import sys, os
marker = os.path.join(os.path.dirname(os.path.abspath(__file__)), "watcher-spawned.marker")
with open(marker, "w") as f:
    f.write(" ".join(sys.argv[1:]))
PY
chmod +x "$FAKE_SCRIPT"

# Create a project slug directory matching how the module resolves it
SLUG=$(node -e "console.log(require('path').resolve('$FAKE_PROJECT').replace(/[^a-zA-Z0-9-]/g, '-'))")
SLUG_DIR="$HOME/.claude/projects/$SLUG"
mkdir -p "$SLUG_DIR"

# Helper: write a transcript JSONL with a given assistant message
write_transcript() {
  local msg="$1"
  echo '{"type":"user","message":{"content":"do something"}}' > "$SLUG_DIR/session.jsonl"
  echo "{\"type\":\"assistant\",\"message\":{\"content\":[{\"text\":\"$msg\"}]}}" >> "$SLUG_DIR/session.jsonl"
}

# Helper: run the module with env vars set, patching constants
run_module() {
  HOOK_RUNNER_TEST=1 \
  CLAUDE_PROJECT_DIR="$FAKE_PROJECT" \
  node -e "
    var fs = require('fs');
    var path = require('path');
    var modPath = path.resolve('$MOD');
    var src = fs.readFileSync(modPath, 'utf-8');
    src = src.replace(/var API_CHECK_SCRIPT = [^;]+;/, 'var API_CHECK_SCRIPT = \"$FAKE_SCRIPT\";');
    src = src.replace(/var LOCK_PATH = [^;]+;/, 'var LOCK_PATH = \"$LOCK\";');
    var tmp = '$TMPDIR_T/patched-auto-continue.js';
    fs.writeFileSync(tmp, src);
    delete require.cache[require.resolve(tmp)];
    var mod = require(tmp);
    var r = mod({});
    process.stdout.write(JSON.stringify(r || null));
  "
}

# --- Test: No API error → no watcher spawned ---
write_transcript "Task completed successfully."
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
check "No spawn when no API error pattern" "[ ! -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: API Error pattern → watcher spawned ---
write_transcript "I encountered an API Error while processing your request."
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Spawns watcher on API Error" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: 503 pattern → watcher spawned ---
write_transcript "The server returned 503 Service Unavailable."
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Spawns watcher on 503" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: overloaded pattern → watcher spawned ---
write_transcript "The API is currently overloaded, please try again later."
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Spawns watcher on overloaded" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: Unable to connect → watcher spawned ---
write_transcript "Unable to connect to the API endpoint."
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Spawns watcher on Unable to connect" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: ECONNREFUSED → watcher spawned ---
write_transcript "Error: connect ECONNREFUSED 127.0.0.1:4100"
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Spawns watcher on ECONNREFUSED" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: Lock file prevents duplicate spawns ---
write_transcript "API Error occurred"
rm -f "$TMPDIR_T/watcher-spawned.marker"
echo "12345" > "$LOCK"
touch "$LOCK"
run_module > /dev/null
sleep 0.5
check "Lock file prevents duplicate spawn" "[ ! -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: Stale lock file (>30 min) gets cleaned and watcher spawns ---
write_transcript "API Error occurred"
rm -f "$TMPDIR_T/watcher-spawned.marker"
echo "12345" > "$LOCK"
touch -d "2 hours ago" "$LOCK" 2>/dev/null || touch -t 202601010000 "$LOCK"
run_module > /dev/null
sleep 0.5
check "Stale lock cleaned watcher spawns" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: Module still blocks regardless of API error detection ---
write_transcript "API Error occurred"
rm -f "$LOCK"
RESULT=$(run_module)
check "Still returns block decision" "echo '$RESULT' | grep -q 'block'"

# --- Test: Watcher receives correct --watch argument ---
write_transcript "Got overloaded error from API"
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Watcher receives --watch and project dir" "grep -q -- '--watch' '$TMPDIR_T/watcher-spawned.marker'"

# --- Test: No CLAUDE_PROJECT_DIR → no crash, no spawn ---
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
CLAUDE_PROJECT_DIR="" HOOK_RUNNER_TEST=1 node -e "
  var fs = require('fs');
  var modPath = require('path').resolve('$MOD');
  var src = fs.readFileSync(modPath, 'utf-8');
  src = src.replace(/var API_CHECK_SCRIPT = [^;]+;/, 'var API_CHECK_SCRIPT = \"$FAKE_SCRIPT\";');
  src = src.replace(/var LOCK_PATH = [^;]+;/, 'var LOCK_PATH = \"$LOCK\";');
  var tmp = '$TMPDIR_T/patched2.js';
  fs.writeFileSync(tmp, src);
  var mod = require(tmp);
  var r = mod({});
  process.stdout.write(JSON.stringify(r || null));
" > /dev/null
check "No crash without CLAUDE_PROJECT_DIR" "[ ! -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: String content format (not array) works ---
echo '{"type":"assistant","message":{"content":"The service returned 503 temporarily"}}' > "$SLUG_DIR/session.jsonl"
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Handles string content format" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: rate limit pattern ---
write_transcript "Request failed due to rate_limit_error from Anthropic."
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Spawns watcher on rate_limit" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: ETIMEDOUT pattern ---
write_transcript "connect ETIMEDOUT 104.18.7.192:443"
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Spawns watcher on ETIMEDOUT" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: socket hang up pattern ---
write_transcript "Error: socket hang up at some connection"
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Spawns watcher on socket hang up" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Cleanup ---
rm -rf "$TMPDIR_T" "$SLUG_DIR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
