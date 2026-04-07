#!/usr/bin/env bash
# Test T340: spec-gate TODO.md fallback requires feature branch in mature projects
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: spec-gate TODO fallback (T340) ==="

MODULE="$REPO_DIR/modules/PreToolUse/spec-gate.js"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Create ONE repo with specs/ + TODO.md, commit on main
PROJ="$TMPDIR/proj"
mkdir -p "$PROJ/specs/feat1" "$PROJ/src"
git init -q "$PROJ"
echo "# Spec" > "$PROJ/specs/feat1/spec.md"
echo "- [x] T001: Done" > "$PROJ/specs/feat1/tasks.md"
echo "- [ ] T340: Fix spec-gate" > "$PROJ/TODO.md"
echo "x" > "$PROJ/src/app.js"
GIT_DIR="$PROJ/.git" GIT_WORK_TREE="$PROJ" git config user.email "t@t"
GIT_DIR="$PROJ/.git" GIT_WORK_TREE="$PROJ" git config user.name "t"
GIT_DIR="$PROJ/.git" GIT_WORK_TREE="$PROJ" git add -A
GIT_DIR="$PROJ/.git" GIT_WORK_TREE="$PROJ" git commit -q --no-gpg-sign -m "init" 2>/dev/null || true

# Simple project (no specs/) — just git init, no commit needed
SIMPLE="$TMPDIR/simple"
mkdir -p "$SIMPLE/src"
git init -q "$SIMPLE"
echo "- [ ] T001: Feature" > "$SIMPLE/TODO.md"
echo "x" > "$SIMPLE/src/app.js"

# Run ALL tests in ONE node process to avoid Windows process-spawning hangs
RESULTS=$(node -e "
  var modPath = process.argv[1];
  var proj = process.argv[2];
  var simple = process.argv[3];
  var results = [];

  function test(dir, file) {
    delete require.cache[require.resolve(modPath)];
    process.env.CLAUDE_PROJECT_DIR = dir;
    try {
      var mod = require(modPath);
      var r = mod({ tool_name: 'Edit', tool_input: { file_path: file } });
      return r && r.decision === 'block' ? 'BLOCKED: ' + r.reason.split('\n')[0] : 'PASSED';
    } catch(e) { return 'ERROR: ' + e.message; }
  }

  results.push(test(proj, proj + '/src/app.js'));    // 0: mature on main
  results.push(test(simple, simple + '/src/app.js'));// 1: simple on main
  results.push(test(proj, proj + '/TODO.md'));        // 2: config file
  console.log(JSON.stringify(results));
" "$MODULE" "$PROJ" "$SIMPLE" 2>/dev/null)

# Parse results
R() { echo "$RESULTS" | node -e "var r=JSON.parse(require('fs').readFileSync(0,'utf-8'));process.stdout.write(r[$1]||'ERROR')"; }

# 1. Mature project on main — BLOCKED
V=$(R 0)
if echo "$V" | grep -q "BLOCKED.*feature branch"; then
  pass "mature project on main blocked — requires feature branch"
else
  fail "mature on main should require feature branch: $V"
fi

# 2. Simple project (no specs/) on main — PASSED
V=$(R 1)
if echo "$V" | grep -q "PASSED"; then
  pass "simple project on main with TODO tasks passes"
else
  fail "simple project should pass: $V"
fi

# 3. Config files allowed on main even in mature projects
V=$(R 2)
if echo "$V" | grep -q "PASSED"; then
  pass "TODO.md edits allowed on main (config file bypass)"
else
  fail "TODO.md should be allowed: $V"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
