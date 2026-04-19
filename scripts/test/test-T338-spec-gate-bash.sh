#!/usr/bin/env bash
# Test T338: spec-gate blocks state-changing Bash commands when spec chain unsatisfied
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: spec-gate Bash gating (T338) ==="

MODULE="$REPO_DIR/modules/PreToolUse/spec-gate.js"

# Create a project with NO open tasks (should block state-changing commands)
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

PROJ="$TMPDIR/proj-no-tasks"
mkdir -p "$PROJ/src"
git init -q "$PROJ"
(cd "$PROJ" && git config user.email "test@test" && git config user.name "test")
cat > "$PROJ/TODO.md" <<'EOF'
# Tasks
- [x] T001: Done
EOF
echo "x" > "$PROJ/src/app.js"
(cd "$PROJ" && git add -A && git commit -q -m "init" 2>/dev/null) || true

# Project WITH open tasks (should allow everything)
PROJ_OK="$TMPDIR/proj-with-tasks"
mkdir -p "$PROJ_OK/src"
git init -q "$PROJ_OK"
(cd "$PROJ_OK" && git config user.email "test@test" && git config user.name "test")
cat > "$PROJ_OK/TODO.md" <<'EOF'
# Tasks
- [ ] T001: Add feature
EOF
echo "x" > "$PROJ_OK/src/app.js"
(cd "$PROJ_OK" && git add -A && git commit -q -m "init" 2>/dev/null) || true

run_bash_gate() {
  local proj_dir="$1"
  local cmd="$2"
  CLAUDE_PROJECT_DIR="$proj_dir" node -e "
    var mod = require('$MODULE');
    var result = mod({ tool_name: 'Bash', tool_input: { command: process.argv[1] } });
    if (result && result.decision === 'block') {
      process.stdout.write('BLOCKED');
      process.exit(1);
    } else {
      process.stdout.write('PASSED');
    }
  " "$cmd" 2>/dev/null || true
}

# --- Read-only commands should ALWAYS pass (even with no open tasks) ---

OUTPUT=$(run_bash_gate "$PROJ" "git status")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "git status allowed (read-only)"
else
  fail "git status should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "ls -la src/")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "ls allowed (read-only)"
else
  fail "ls should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "grep -r TODO src/")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "grep allowed (read-only)"
else
  fail "grep should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "cat src/app.js")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "cat allowed (read-only)"
else
  fail "cat should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "gh pr list")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "gh allowed (read-only)"
else
  fail "gh should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "node -e \"console.log(1+1)\"")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node -e quick eval allowed"
else
  fail "node -e should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "bash scripts/test/test-T338-spec-gate-bash.sh")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "bash scripts/test/ allowed"
else
  fail "bash scripts/test/ should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "cd src && git log --oneline")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "cd + git allowed (read-only after cd)"
else
  fail "cd + git should be allowed: $OUTPUT"
fi

# --- State-changing commands should be BLOCKED with no open tasks ---

OUTPUT=$(run_bash_gate "$PROJ" "npm install express")
if [ "$OUTPUT" = "BLOCKED" ]; then
  pass "npm install blocked (state-changing)"
else
  fail "npm install should be blocked: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "cargo build")
if [ "$OUTPUT" = "BLOCKED" ]; then
  pass "cargo build blocked (state-changing)"
else
  fail "cargo build should be blocked: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "cp src/app.js src/backup.js")
if [ "$OUTPUT" = "BLOCKED" ]; then
  pass "cp blocked (state-changing)"
else
  fail "cp should be blocked: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "rm src/app.js")
if [ "$OUTPUT" = "BLOCKED" ]; then
  pass "rm blocked (state-changing)"
else
  fail "rm should be blocked: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "python setup.py install")
if [ "$OUTPUT" = "BLOCKED" ]; then
  pass "python setup.py blocked (state-changing)"
else
  fail "python setup.py should be blocked: $OUTPUT"
fi

# --- State-changing commands should PASS with open tasks ---

OUTPUT=$(run_bash_gate "$PROJ_OK" "npm install express")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "npm install allowed with open tasks"
else
  fail "npm install should pass with open tasks: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ_OK" "cargo build")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "cargo build allowed with open tasks"
else
  fail "cargo build should pass with open tasks: $OUTPUT"
fi

# --- T384: Session management scripts always allowed ---

OUTPUT=$(run_bash_gate "$PROJ" "python ~/Documents/ProjectsCL1/_grobomo/context-reset/new_session.py --project-dir .")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "python new_session.py allowed (session management)"
else
  fail "python new_session.py should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "python ~/Documents/ProjectsCL1/_grobomo/context-reset/context_reset.py --project-dir .")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "python context_reset.py allowed (session management)"
else
  fail "python context_reset.py should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "curl -s http://localhost:8790/healthz")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "curl allowed (HTTP requests)"
else
  fail "curl should be allowed: $OUTPUT"
fi

# --- T477: hook-runner read-only commands always allowed ---

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --perf")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --perf allowed (read-only)"
else
  fail "node setup.js --perf should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --stats")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --stats allowed (read-only)"
else
  fail "node setup.js --stats should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --health")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --health allowed (read-only)"
else
  fail "node setup.js --health should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --snapshot")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --snapshot allowed (read-only)"
else
  fail "node setup.js --snapshot should be allowed: $OUTPUT"
fi

# --- T488: sync/upgrade commands always allowed ---

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --sync")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --sync allowed (operational)"
else
  fail "node setup.js --sync should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --upgrade")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --upgrade allowed (operational)"
else
  fail "node setup.js --upgrade should be allowed: $OUTPUT"
fi

# --- T495: audit-project, manifest, analyze, workflow commands always allowed ---

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --audit-project dd-lab")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --audit-project allowed (read-only)"
else
  fail "node setup.js --audit-project should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --manifest")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --manifest allowed (read-only)"
else
  fail "node setup.js --manifest should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --analyze")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --analyze allowed (read-only)"
else
  fail "node setup.js --analyze should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "node setup.js --workflow list")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "node setup.js --workflow allowed (operational)"
else
  fail "node setup.js --workflow should be allowed: $OUTPUT"
fi

OUTPUT=$(run_bash_gate "$PROJ" "cd /some/project && node setup.js --audit-project myproj")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "cd + audit-project allowed (read-only after cd)"
else
  fail "cd + audit-project should be allowed: $OUTPUT"
fi

# --- Piped commands check the first command ---

OUTPUT=$(run_bash_gate "$PROJ" "jq '.name' package.json | head -1")
if [ "$OUTPUT" = "PASSED" ]; then
  pass "jq piped to head allowed (read-only)"
else
  fail "jq pipe should be allowed: $OUTPUT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
