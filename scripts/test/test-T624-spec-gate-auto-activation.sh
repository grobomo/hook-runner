#!/usr/bin/env bash
# Test T624: spec-gate auto-activation — dormant unless project qualifies
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: spec-gate auto-activation (T624) ==="

MODULE="$REPO_DIR/modules/PreToolUse/spec-gate.js"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

# Ensure SPEC_GATE_ACTIVE is NOT set (we're testing auto-activation itself)
unset SPEC_GATE_ACTIVE

init_git() {
  local d="$1"
  GIT_DIR="$d/.git" GIT_WORK_TREE="$d" git config user.email "test@test"
  GIT_DIR="$d/.git" GIT_WORK_TREE="$d" git config user.name "test"
  GIT_DIR="$d/.git" GIT_WORK_TREE="$d" git add -A
  GIT_DIR="$d/.git" GIT_WORK_TREE="$d" git commit -q --no-gpg-sign -m "init" 2>/dev/null || true
}

run_gate() {
  local proj="$1"
  local file="$2"
  local branch="${3:-main}"
  HOOK_RUNNER_TEST=1 CLAUDE_PROJECT_DIR="$proj" node -e "
    delete require.cache[require.resolve('$MODULE')];
    var gate = require('$MODULE');
    var result = gate({
      tool_name: 'Edit',
      tool_input: { file_path: '$file' },
      _git: { branch: '$branch' }
    });
    process.stdout.write(result ? 'BLOCK:' + result.reason.substring(0, 50) : 'NULL');
  " 2>/dev/null
}

# === Test 1: Dormant — no publish.json, no specs/, main branch ===
PROJ1="$TMPDIR/dormant-project"
mkdir -p "$PROJ1/src"
git init -q "$PROJ1"
cat > "$PROJ1/TODO.md" <<'EOF'
- [ ] T001: Something
EOF
echo "x" > "$PROJ1/src/app.js"
init_git "$PROJ1"

RESULT=$(run_gate "$PROJ1" "$PROJ1/src/app.js" "main")
if [ "$RESULT" = "NULL" ]; then
  pass "Dormant: no publish.json, no specs/, main branch → gate inactive"
else
  fail "Dormant: no publish.json, no specs/, main branch → gate inactive: got $RESULT"
fi

# === Test 2: Active — publish.json with visibility=public, no tasks → blocks ===
PROJ2="$TMPDIR/public-project"
mkdir -p "$PROJ2/src" "$PROJ2/.github"
git init -q "$PROJ2"
cat > "$PROJ2/.github/publish.json" <<'EOF'
{"github_account": "grobomo", "visibility": "public", "reason": "test"}
EOF
echo "x" > "$PROJ2/src/app.js"
init_git "$PROJ2"

RESULT=$(run_gate "$PROJ2" "$PROJ2/src/app.js" "fix-something")
if [ "$RESULT" != "NULL" ]; then
  pass "Active: publish.json visibility=public, no tasks → gate blocks"
else
  fail "Active: publish.json visibility=public, no tasks → gate blocks: got NULL"
fi

# === Test 3: Active — specs/ directory exists, incomplete chain → blocks ===
PROJ3="$TMPDIR/specs-project"
mkdir -p "$PROJ3/src" "$PROJ3/specs/feature-x"
git init -q "$PROJ3"
echo "# Spec" > "$PROJ3/specs/feature-x/spec.md"
echo "x" > "$PROJ3/src/app.js"
init_git "$PROJ3"

RESULT=$(run_gate "$PROJ3" "$PROJ3/src/app.js" "fix-feature-x")
if [ "$RESULT" != "NULL" ]; then
  pass "Active: specs/ exists, incomplete chain → gate blocks"
else
  fail "Active: specs/ exists, incomplete chain → gate blocks: got NULL"
fi

# === Test 4: Active — shared org (not grobomo), no tasks → blocks ===
PROJ4="$TMPDIR/shared-org-project"
mkdir -p "$PROJ4/src" "$PROJ4/.github"
git init -q "$PROJ4"
cat > "$PROJ4/.github/publish.json" <<'EOF'
{"github_account": "your-org", "visibility": "private", "reason": "internal"}
EOF
echo "x" > "$PROJ4/src/app.js"
init_git "$PROJ4"

RESULT=$(run_gate "$PROJ4" "$PROJ4/src/app.js" "fix-something")
if [ "$RESULT" != "NULL" ]; then
  pass "Active: shared org (tmemu), no tasks → gate blocks"
else
  fail "Active: shared org (tmemu), no tasks → gate blocks: got NULL"
fi

# === Test 5: Active — feat/ branch prefix, no tasks → blocks ===
PROJ5="$TMPDIR/feat-branch"
mkdir -p "$PROJ5/src"
git init -q "$PROJ5"
echo "x" > "$PROJ5/src/app.js"
init_git "$PROJ5"

RESULT=$(run_gate "$PROJ5" "$PROJ5/src/app.js" "feat/add-login")
if [ "$RESULT" != "NULL" ]; then
  pass "Active: feat/ branch, no tasks → gate blocks"
else
  fail "Active: feat/ branch, no tasks → gate blocks: got NULL"
fi

# === Test 6: Active — feat- branch prefix (hyphen variant), no tasks → blocks ===
RESULT=$(run_gate "$PROJ5" "$PROJ5/src/app.js" "feat-add-login")
if [ "$RESULT" != "NULL" ]; then
  pass "Active: feat- branch (hyphen), no tasks → gate blocks"
else
  fail "Active: feat- branch (hyphen), no tasks → gate blocks: got NULL"
fi

# === Test 7: Dormant — private repo, no specs/, non-feat branch ===
PROJ7="$TMPDIR/private-no-specs"
mkdir -p "$PROJ7/src" "$PROJ7/.github"
git init -q "$PROJ7"
cat > "$PROJ7/.github/publish.json" <<'EOF'
{"github_account": "grobomo", "visibility": "private", "reason": "experiment"}
EOF
cat > "$PROJ7/TODO.md" <<'EOF'
- [ ] T001: Something
EOF
echo "x" > "$PROJ7/src/app.js"
init_git "$PROJ7"

RESULT=$(run_gate "$PROJ7" "$PROJ7/src/app.js" "fix-T001-something")
if [ "$RESULT" = "NULL" ]; then
  pass "Dormant: private grobomo repo, no specs/, not feat/ → gate inactive"
else
  fail "Dormant: private grobomo repo, no specs/, not feat/ → gate inactive: got $RESULT"
fi

# === Test 8: SPEC_GATE_ACTIVE=1 override on dormant project with no tasks ===
PROJ8="$TMPDIR/override-project"
mkdir -p "$PROJ8/src" "$PROJ8/.github"
git init -q "$PROJ8"
cat > "$PROJ8/.github/publish.json" <<'EOF'
{"github_account": "grobomo", "visibility": "private", "reason": "experiment"}
EOF
echo "x" > "$PROJ8/src/app.js"
init_git "$PROJ8"

RESULT=$(SPEC_GATE_ACTIVE=1 HOOK_RUNNER_TEST=1 CLAUDE_PROJECT_DIR="$PROJ8" node -e "
  delete require.cache[require.resolve('$MODULE')];
  var gate = require('$MODULE');
  var result = gate({
    tool_name: 'Edit',
    tool_input: { file_path: '$PROJ8/src/app.js' },
    _git: { branch: 'fix-something' }
  });
  process.stdout.write(result ? 'BLOCK' : 'NULL');
" 2>/dev/null)
if [ "$RESULT" != "NULL" ]; then
  pass "SPEC_GATE_ACTIVE=1 forces activation on dormant project"
else
  fail "SPEC_GATE_ACTIVE=1 forces activation on dormant project: got NULL"
fi

# === Test 9: Dormant projects still allow Edit/Write freely ===
RESULT=$(run_gate "$PROJ1" "$PROJ1/src/app.js" "fix-something")
if [ "$RESULT" = "NULL" ]; then
  pass "Dormant project: Edit passes freely (no enforcement)"
else
  fail "Dormant project: Edit passes freely: got $RESULT"
fi

# === Test 10: Active project with full spec chain → allows edit ===
PROJ10="$TMPDIR/full-chain"
mkdir -p "$PROJ10/src" "$PROJ10/specs/login" "$PROJ10/.github"
git init -q "$PROJ10"
cat > "$PROJ10/.github/publish.json" <<'EOF'
{"github_account": "grobomo", "visibility": "public", "reason": "test"}
EOF
echo "# Login spec" > "$PROJ10/specs/login/spec.md"
cat > "$PROJ10/specs/login/tasks.md" <<'EOF'
- [ ] T001: Implement login form
EOF
echo "x" > "$PROJ10/src/app.js"
init_git "$PROJ10"

RESULT=$(run_gate "$PROJ10" "$PROJ10/src/app.js" "fix-T001-login")
if [ "$RESULT" = "NULL" ]; then
  pass "Active project with full chain → edit allowed"
else
  fail "Active project with full chain → edit allowed: got $RESULT"
fi

# === Test 11: T792 — TODO.md activates gate even without specs/ or publish.json ===
# Previously this was dormant. Now shouldActivate returns true because TODO.md has items.
# Gate still allows the edit (TODO is sufficient for simple projects) but enforcement runs.
PROJ11="$TMPDIR/todo-activates"
mkdir -p "$PROJ11/src"
git init -q "$PROJ11"
cat > "$PROJ11/TODO.md" <<'EOF'
- [ ] T042: Build the feature
EOF
echo "x" > "$PROJ11/src/app.js"
init_git "$PROJ11"

# On a task branch matching T042 → gate runs, finds T042 in TODO, allows
RESULT=$(run_gate "$PROJ11" "$PROJ11/src/app.js" "fix-T042-feature")
if [ "$RESULT" = "NULL" ]; then
  pass "T792: TODO.md activates gate, task branch matches TODO item → allowed"
else
  fail "T792: TODO.md activates gate, task branch matches → got $RESULT"
fi

# === Test 12: Without TODO.md and without specs/ → truly dormant ===
PROJ12="$TMPDIR/truly-dormant"
mkdir -p "$PROJ12/src"
git init -q "$PROJ12"
echo "x" > "$PROJ12/src/app.js"
init_git "$PROJ12"

RESULT=$(run_gate "$PROJ12" "$PROJ12/src/app.js" "fix-something")
if [ "$RESULT" = "NULL" ]; then
  pass "Truly dormant: no TODO, no specs, no publish.json → gate inactive"
else
  fail "Truly dormant: got $RESULT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
