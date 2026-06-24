#!/usr/bin/env bash
# CI-SKIP — requires python3 for api_check.py mock
# T635: Test api-watcher.js (SessionStart) — spawns api_check.py --watch sentinel
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

MOD="modules/SessionStart/api-watcher.js"
TMPDIR_T_RAW=$(mktemp -d)
TMPDIR_T="$(cd "$TMPDIR_T_RAW" && (pwd -W 2>/dev/null || pwd))"
FAKE_PROJECT="$TMPDIR_T/project"
LOCK="$TMPDIR_T/api-check-watcher.lock"
FAKE_SCRIPT="$TMPDIR_T/api_check.py"

mkdir -p "$FAKE_PROJECT"

# Create a fake api_check.py that touches a marker file
cat > "$FAKE_SCRIPT" << 'PY'
#!/usr/bin/env python3
import sys, os
marker = os.path.join(os.path.dirname(os.path.abspath(__file__)), "watcher-spawned.marker")
with open(marker, "w") as f:
    f.write(" ".join(sys.argv[1:]))
PY
chmod +x "$FAKE_SCRIPT"

# Helper: run the module with patched constants
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
    var tmp = '$TMPDIR_T/patched.js';
    fs.writeFileSync(tmp, src);
    delete require.cache[tmp];
    var mod = require(tmp);
    var r = mod();
    process.stdout.write(JSON.stringify(r || null));
  "
}

# --- Test: Spawns watcher on session start ---
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Spawns watcher at session start" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: Returns null (non-blocking) ---
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
RESULT=$(run_module)
check "Returns null (non-blocking)" "[ '$RESULT' = 'null' ]"

# --- Test: Watcher receives --watch and project dir ---
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
sleep 0.5
check "Watcher receives --watch and project dir" "grep -q -- '--watch' '$TMPDIR_T/watcher-spawned.marker' && grep -q '$FAKE_PROJECT' '$TMPDIR_T/watcher-spawned.marker'"

# --- Test: Lock file prevents duplicate spawns ---
rm -f "$TMPDIR_T/watcher-spawned.marker"
echo "12345" > "$LOCK"
touch "$LOCK"
run_module > /dev/null
sleep 0.5
check "Lock file prevents duplicate spawn" "[ ! -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: Stale lock file gets cleaned, watcher spawns ---
rm -f "$TMPDIR_T/watcher-spawned.marker"
echo "12345" > "$LOCK"
touch -d "2 hours ago" "$LOCK" 2>/dev/null || touch -t 202601010000 "$LOCK"
run_module > /dev/null
sleep 0.5
check "Stale lock cleaned watcher spawns" "[ -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: No CLAUDE_PROJECT_DIR → no spawn, no crash ---
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
  var r = mod();
  process.stdout.write(JSON.stringify(r || null));
" > /dev/null
check "No crash without CLAUDE_PROJECT_DIR" "[ ! -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: Missing api_check.py → no spawn, no crash ---
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
HOOK_RUNNER_TEST=1 CLAUDE_PROJECT_DIR="$FAKE_PROJECT" node -e "
  var fs = require('fs');
  var modPath = require('path').resolve('$MOD');
  var src = fs.readFileSync(modPath, 'utf-8');
  src = src.replace(/var API_CHECK_SCRIPT = [^;]+;/, 'var API_CHECK_SCRIPT = \"/nonexistent/path.py\";');
  src = src.replace(/var LOCK_PATH = [^;]+;/, 'var LOCK_PATH = \"$LOCK\";');
  var tmp = '$TMPDIR_T/patched3.js';
  fs.writeFileSync(tmp, src);
  var mod = require(tmp);
  var r = mod();
  process.stdout.write(JSON.stringify(r || null));
" > /dev/null
check "No crash with missing script" "[ ! -f '$TMPDIR_T/watcher-spawned.marker' ]"

# --- Test: Lock file is created after spawn ---
rm -f "$TMPDIR_T/watcher-spawned.marker" "$LOCK"
run_module > /dev/null
check "Lock file created after spawn" "[ -f '$LOCK' ]"

# --- Cleanup ---
rm -rf "$TMPDIR_T"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
