#!/usr/bin/env bash
# Test T106: spec-gate accepts TODO.md with `- [ ] TXXX:` as valid task source
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: spec-gate relaxed (T106) ==="

MODULE="$REPO_DIR/modules/PreToolUse/spec-gate.js"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

init_git() {
  # Use GIT_DIR/GIT_WORK_TREE instead of cd — avoids hangs in Git Bash on Windows
  local d="$1"
  GIT_DIR="$d/.git" GIT_WORK_TREE="$d" git config user.email "test@test"
  GIT_DIR="$d/.git" GIT_WORK_TREE="$d" git config user.name "test"
  GIT_DIR="$d/.git" GIT_WORK_TREE="$d" git add -A
  GIT_DIR="$d/.git" GIT_WORK_TREE="$d" git commit -q --no-gpg-sign -m "init" 2>/dev/null || true
}

# 1. Project with only TODO.md containing unchecked tasks
PROJ1="$TMPDIR/proj-todo-only"
mkdir -p "$PROJ1/src"
git init -q "$PROJ1"
cat > "$PROJ1/TODO.md" <<'EOF'
# Tasks
- [ ] T001: Add feature X
- [ ] T002: Fix bug Y
EOF
echo "x" > "$PROJ1/src/app.js"
init_git "$PROJ1"

# 2. Project with only TODO.md but all tasks checked
PROJ2="$TMPDIR/proj-todo-done"
mkdir -p "$PROJ2/src"
git init -q "$PROJ2"
cat > "$PROJ2/TODO.md" <<'EOF'
# Tasks
- [x] T001: Add feature X
- [x] T002: Fix bug Y
EOF
echo "x" > "$PROJ2/src/app.js"
init_git "$PROJ2"

# 3. Project with no specs/ and no TODO.md
PROJ3="$TMPDIR/proj-empty"
mkdir -p "$PROJ3/src"
git init -q "$PROJ3"
echo "x" > "$PROJ3/src/app.js"
init_git "$PROJ3"

# 4. Project with specs/*/tasks.md + spec.md
PROJ4="$TMPDIR/proj-specs"
mkdir -p "$PROJ4/specs/feat1" "$PROJ4/src"
git init -q "$PROJ4"
echo "# Feature 1 Spec" > "$PROJ4/specs/feat1/spec.md"
cat > "$PROJ4/specs/feat1/tasks.md" <<'EOF'
- [ ] T001: Build it
EOF
echo "x" > "$PROJ4/src/app.js"
init_git "$PROJ4"

# 6. Mixed: specs all checked + TODO.md unchecked (needs feature branch for T340)
PROJ6="$TMPDIR/proj-mixed"
mkdir -p "$PROJ6/specs/feat1" "$PROJ6/src"
git init -q "$PROJ6"
echo "# Spec" > "$PROJ6/specs/feat1/spec.md"
cat > "$PROJ6/specs/feat1/tasks.md" <<'EOF'
- [x] T001: Done
EOF
cat > "$PROJ6/TODO.md" <<'EOF'
- [ ] T099: New work in TODO
EOF
echo "x" > "$PROJ6/src/app.js"
init_git "$PROJ6"
# Create feature branch for test 6
GIT_DIR="$PROJ6/.git" GIT_WORK_TREE="$PROJ6" git checkout -b 100-T099-new-work 2>/dev/null

# Run tests 1-6 in ONE node process to avoid Windows process-spawning hangs
RESULTS=$(node -e "
  var modPath = process.argv[1];
  var dirs = JSON.parse(process.argv[2]);
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

  results.push(test(dirs.p1, dirs.p1 + '/src/app.js'));  // 0: TODO unchecked
  results.push(test(dirs.p2, dirs.p2 + '/src/app.js'));  // 1: TODO all checked
  results.push(test(dirs.p3, dirs.p3 + '/src/app.js'));  // 2: no TODO, no specs
  results.push(test(dirs.p4, dirs.p4 + '/src/app.js'));  // 3: specs/tasks.md
  results.push(test(dirs.p3, dirs.p3 + '/src/app.js'));  // 4: block mentions TODO.md
  results.push(test(dirs.p6, dirs.p6 + '/src/app.js'));  // 5: mixed on feature branch

  console.log(JSON.stringify(results));
" "$MODULE" "{\"p1\":\"$PROJ1\",\"p2\":\"$PROJ2\",\"p3\":\"$PROJ3\",\"p4\":\"$PROJ4\",\"p6\":\"$PROJ6\"}" 2>/dev/null)

R() { echo "$RESULTS" | node -e "var r=JSON.parse(require('fs').readFileSync(0,'utf-8'));process.stdout.write(r[$1]||'ERROR')"; }

V=$(R 0)
if echo "$V" | grep -q "PASSED"; then pass "TODO.md with unchecked tasks allows edits"
else fail "TODO.md with unchecked tasks should allow edits: $V"; fi

V=$(R 1)
if echo "$V" | grep -q "BLOCKED"; then pass "TODO.md with all tasks checked blocks edits"
else fail "TODO.md with all tasks checked should block: $V"; fi

V=$(R 2)
if echo "$V" | grep -q "BLOCKED"; then pass "No tasks.md and no TODO.md blocks edits"
else fail "No task sources should block: $V"; fi

V=$(R 3)
if echo "$V" | grep -q "PASSED"; then pass "specs/*/tasks.md still works as task source"
else fail "specs/*/tasks.md should still work: $V"; fi

V=$(R 4)
if echo "$V" | grep -q "TODO.md"; then pass "Block message mentions TODO.md as alternative"
else fail "Block message should mention TODO.md: $V"; fi

V=$(R 5)
if echo "$V" | grep -q "PASSED"; then pass "Mixed: checked specs + unchecked TODO.md allows edits (feature branch)"
else fail "Mixed sources should pass on feature branch: $V"; fi

# 7. T340: Switch to main — separate node call (needs git checkout first)
GIT_DIR="$PROJ6/.git" GIT_WORK_TREE="$PROJ6" git checkout main 2>/dev/null
RESULT7=$(node -e "
  var modPath = process.argv[1], dir = process.argv[2];
  delete require.cache[require.resolve(modPath)];
  process.env.CLAUDE_PROJECT_DIR = dir;
  var mod = require(modPath);
  var r = mod({ tool_name: 'Edit', tool_input: { file_path: dir + '/src/app.js' } });
  process.stdout.write(r && r.decision === 'block' ? 'BLOCKED: ' + r.reason.split('\n')[0] : 'PASSED');
" "$MODULE" "$PROJ6" 2>/dev/null)
if echo "$RESULT7" | grep -q "BLOCKED.*feature branch"; then
  pass "T340: main + specs/ + TODO.md blocks (requires feature branch)"
else
  fail "T340: should block on main with specs: $RESULT7"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
