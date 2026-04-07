#!/usr/bin/env bash
# Test T351: Session collision detection
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: session-collision-detector (T351) ==="

MODULE="$REPO_DIR/modules/SessionStart/session-collision-detector.js"
CLEANUP="$REPO_DIR/modules/SessionStart/session-cleanup.js"
TMPDIR_PATH="$(node -e "console.log(require('os').tmpdir())")"

# 1. Module loads and exports function
OUTPUT=$(node -e "var m = require('$MODULE'); console.log(typeof m)" 2>&1)
if [ "$OUTPUT" = "function" ]; then pass "exports function"; else fail "bad export: $OUTPUT"; fi

# 2. Returns null when no collisions (clean state)
OUTPUT=$(node -e "
  // Clean any existing lock files for this test
  var fs = require('fs'), os = require('os'), path = require('path');
  var tmp = os.tmpdir();
  var files = fs.readdirSync(tmp);
  for (var i = 0; i < files.length; i++) {
    if (files[i].indexOf('.claude-session-lock-') === 0) {
      try { fs.unlinkSync(path.join(tmp, files[i])); } catch(e) {}
    }
  }
  var m = require('$MODULE');
  var result = m();
  console.log(result === null ? 'NULL' : 'NOT_NULL');
" 2>&1)
if echo "$OUTPUT" | grep -q "NULL"; then pass "returns null with no collisions"; else fail "should return null: $OUTPUT"; fi

# 3. Writes a lock file on invocation
OUTPUT=$(node -e "
  var fs = require('fs'), os = require('os'), path = require('path');
  process.env.CLAUDE_PROJECT_DIR = '$REPO_DIR';
  // Clear require cache
  delete require.cache[require.resolve('$MODULE')];
  var m = require('$MODULE');
  m();
  var tmp = os.tmpdir();
  var found = false;
  var files = fs.readdirSync(tmp);
  for (var i = 0; i < files.length; i++) {
    if (files[i].indexOf('.claude-session-lock-') === 0 &&
        files[i].indexOf('-' + process.ppid) !== -1) {
      found = true;
      // Clean up
      fs.unlinkSync(path.join(tmp, files[i]));
      break;
    }
  }
  console.log(found ? 'FOUND' : 'MISSING');
" 2>&1)
if echo "$OUTPUT" | grep -q "FOUND"; then pass "writes lock file with ppid"; else fail "no lock file written: $OUTPUT"; fi

# 4. Lock file contains JSON with project + branch + pid
OUTPUT=$(node -e "
  var fs = require('fs'), os = require('os'), path = require('path');
  process.env.CLAUDE_PROJECT_DIR = '$REPO_DIR';
  delete require.cache[require.resolve('$MODULE')];
  var m = require('$MODULE');
  m();
  var tmp = os.tmpdir();
  var files = fs.readdirSync(tmp);
  for (var i = 0; i < files.length; i++) {
    if (files[i].indexOf('.claude-session-lock-') === 0 &&
        files[i].indexOf('-' + process.ppid) !== -1) {
      var data = JSON.parse(fs.readFileSync(path.join(tmp, files[i]), 'utf-8'));
      var ok = data.pid && data.project && data.ts;
      console.log(ok ? 'VALID' : 'INVALID');
      fs.unlinkSync(path.join(tmp, files[i]));
      break;
    }
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "VALID"; then pass "lock file has pid+project+ts"; else fail "lock data invalid: $OUTPUT"; fi

# 5. Detects collision when another lock exists with running PID
OUTPUT=$(node -e "
  var fs = require('fs'), os = require('os'), path = require('path');
  var dir = '$REPO_DIR';
  process.env.CLAUDE_PROJECT_DIR = dir;
  var hash = dir.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').substring(0, 80);
  var tmp = os.tmpdir();
  // Write a fake lock for PID 4 (System process, always running on Windows)
  // On Linux, use PID 1 (init)
  var fakePid = process.platform === 'win32' ? 4 : 1;
  var fakeLock = path.join(tmp, '.claude-session-lock-' + hash + '-' + fakePid);
  fs.writeFileSync(fakeLock, JSON.stringify({ ts: new Date().toISOString(), pid: fakePid, project: dir, branch: 'main' }));
  delete require.cache[require.resolve('$MODULE')];
  var m = require('$MODULE');
  var result = m();
  // Clean up both locks
  try { fs.unlinkSync(fakeLock); } catch(e) {}
  var files = fs.readdirSync(tmp);
  for (var i = 0; i < files.length; i++) {
    if (files[i].indexOf('.claude-session-lock-') === 0 && files[i].indexOf('-' + process.ppid) !== -1) {
      try { fs.unlinkSync(path.join(tmp, files[i])); } catch(e) {}
    }
  }
  if (result && typeof result === 'string' && result.indexOf('SESSION COLLISION WARNING') !== -1) {
    console.log('COLLISION_DETECTED');
  } else {
    console.log('NO_COLLISION: ' + JSON.stringify(result));
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "COLLISION_DETECTED"; then pass "detects collision with running PID"; else fail "missed collision: $OUTPUT"; fi

# 6. Ignores lock files for dead PIDs (cleans them up)
OUTPUT=$(node -e "
  var fs = require('fs'), os = require('os'), path = require('path');
  var dir = '$REPO_DIR';
  process.env.CLAUDE_PROJECT_DIR = dir;
  var hash = dir.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').substring(0, 80);
  var tmp = os.tmpdir();
  // Write a fake lock for a PID that definitely doesn't exist
  var deadPid = 99999;
  var fakeLock = path.join(tmp, '.claude-session-lock-' + hash + '-' + deadPid);
  fs.writeFileSync(fakeLock, JSON.stringify({ ts: '2026-01-01T00:00:00Z', pid: deadPid, project: dir, branch: 'old-branch' }));
  delete require.cache[require.resolve('$MODULE')];
  var m = require('$MODULE');
  var result = m();
  // Check that the stale lock was cleaned up
  var staleExists = false;
  try { fs.statSync(fakeLock); staleExists = true; } catch(e) {}
  // Clean up our own lock
  var files = fs.readdirSync(tmp);
  for (var i = 0; i < files.length; i++) {
    if (files[i].indexOf('.claude-session-lock-') === 0 && files[i].indexOf('-' + process.ppid) !== -1) {
      try { fs.unlinkSync(path.join(tmp, files[i])); } catch(e) {}
    }
  }
  if (!staleExists && result === null) {
    console.log('CLEANED');
  } else {
    console.log('NOT_CLEANED staleExists=' + staleExists + ' result=' + JSON.stringify(result));
  }
" 2>&1)
if echo "$OUTPUT" | grep -q "CLEANED"; then pass "cleans stale lock for dead PID"; else fail "didn't clean stale lock: $OUTPUT"; fi

# 7. No false positive for different project
OUTPUT=$(node -e "
  var fs = require('fs'), os = require('os'), path = require('path');
  process.env.CLAUDE_PROJECT_DIR = '/tmp/project-A';
  var hashA = '/tmp/project-A'.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').substring(0, 80);
  var tmp = os.tmpdir();
  // Write a lock for a different project with a running PID
  var fakePid = process.platform === 'win32' ? 4 : 1;
  var otherHash = '/tmp/project-B'.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').substring(0, 80);
  var fakeLock = path.join(tmp, '.claude-session-lock-' + otherHash + '-' + fakePid);
  fs.writeFileSync(fakeLock, JSON.stringify({ ts: new Date().toISOString(), pid: fakePid, project: '/tmp/project-B', branch: 'main' }));
  delete require.cache[require.resolve('$MODULE')];
  var m = require('$MODULE');
  var result = m();
  try { fs.unlinkSync(fakeLock); } catch(e) {}
  // Clean our lock
  var files = fs.readdirSync(tmp);
  for (var i = 0; i < files.length; i++) {
    if (files[i].indexOf('.claude-session-lock-') === 0 && files[i].indexOf('-' + process.ppid) !== -1) {
      try { fs.unlinkSync(path.join(tmp, files[i])); } catch(e) {}
    }
  }
  console.log(result === null ? 'NO_FALSE_POSITIVE' : 'FALSE_POSITIVE');
" 2>&1)
if echo "$OUTPUT" | grep -q "NO_FALSE_POSITIVE"; then pass "no false positive for different project"; else fail "false positive: $OUTPUT"; fi

# 8. session-cleanup cleans stale lock files
OUTPUT=$(node -e "
  var fs = require('fs'), os = require('os'), path = require('path');
  var tmp = os.tmpdir();
  var deadPid = 99998;
  var fakeLock = path.join(tmp, '.claude-session-lock-test-project-' + deadPid);
  fs.writeFileSync(fakeLock, JSON.stringify({ ts: '2026-01-01', pid: deadPid }));
  delete require.cache[require.resolve('$CLEANUP')];
  var cleanup = require('$CLEANUP');
  cleanup();
  var exists = false;
  try { fs.statSync(fakeLock); exists = true; } catch(e) {}
  console.log(exists ? 'STILL_EXISTS' : 'CLEANED');
" 2>&1)
if echo "$OUTPUT" | grep -q "CLEANED"; then pass "session-cleanup sweeps stale lock files"; else fail "cleanup missed lock file: $OUTPUT"; fi

echo ""
echo "Results: $PASS passed, $FAIL failed (total $((PASS + FAIL)))"
[ "$FAIL" -eq 0 ] || exit 1
