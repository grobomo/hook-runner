#!/usr/bin/env bash
# Test T107: test-checkpoint-gate (renamed from gsd-gate) with auto-detect
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: test-checkpoint-gate (T107) ==="

# Node.js helper for running the gate
HELPER="$REPO_DIR/scripts/test/.checkpoint-gate-helper.js"
cat > "$HELPER" <<'JSEOF'
var path = require("path");
var pdir = path.resolve(process.argv[2]);
var tfile = path.resolve(process.argv[3]);
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "test-checkpoint-gate.js");

process.env.CLAUDE_PROJECT_DIR = pdir;
try {
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);
  var result = mod({ tool_name: "Edit", tool_input: { file_path: tfile } });
  if (result && result.decision === "block") {
    process.stdout.write("BLOCKED: " + result.reason);
    process.exit(1);
  } else {
    process.stdout.write("PASSED");
    process.exit(0);
  }
} catch(e) {
  process.stderr.write("ERROR: " + e.message + "\n" + e.stack);
  process.exit(2);
}
JSEOF

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR" "$HELPER"' EXIT

run_gate() {
  node "$HELPER" "$1" "$2" 2>&1 || true
}

# 1. Spec with Checkpoint — should pass (original behavior)
PROJ1="$TMPDIR/proj-spec-checkpoint"
mkdir -p "$PROJ1/specs/feat1" "$PROJ1/scripts/test" "$PROJ1/src"
git init -q "$PROJ1"
cat > "$PROJ1/specs/feat1/tasks.md" <<'EOF'
## Phase 1: Build

- [ ] T001: Build the thing

**Checkpoint**: `bash scripts/test/test-T001.sh` exits 0
EOF
echo "x" > "$PROJ1/scripts/test/test-T001.sh"
echo "x" > "$PROJ1/src/app.js"

OUTPUT=$(run_gate "$PROJ1" "$PROJ1/src/app.js")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Spec with Checkpoint + test script passes"
else
  fail "Spec with Checkpoint should pass: $OUTPUT"
fi

# 2. Spec WITHOUT Checkpoint, but test file exists — should pass (auto-detect)
PROJ2="$TMPDIR/proj-spec-autodetect"
mkdir -p "$PROJ2/specs/feat1" "$PROJ2/scripts/test" "$PROJ2/src"
git init -q "$PROJ2"
cat > "$PROJ2/specs/feat1/tasks.md" <<'EOF'
## Phase 1: Build

- [ ] T010: Auto-detected task
EOF
echo "x" > "$PROJ2/scripts/test/test-T010-auto.sh"
echo "x" > "$PROJ2/src/app.js"

OUTPUT=$(run_gate "$PROJ2" "$PROJ2/src/app.js")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Spec without Checkpoint but with test file auto-detects"
else
  fail "Auto-detect test file should pass: $OUTPUT"
fi

# 3. Spec WITHOUT Checkpoint and NO test file — should block
PROJ3="$TMPDIR/proj-spec-no-test"
mkdir -p "$PROJ3/specs/feat1" "$PROJ3/src"
git init -q "$PROJ3"
cat > "$PROJ3/specs/feat1/tasks.md" <<'EOF'
## Phase 1: Build

- [ ] T020: No test at all
EOF
echo "x" > "$PROJ3/src/app.js"

OUTPUT=$(run_gate "$PROJ3" "$PROJ3/src/app.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "Spec without Checkpoint and no test file blocks"
else
  fail "No test should block: $OUTPUT"
fi

# 4. TODO.md-only project with test files — should pass
PROJ4="$TMPDIR/proj-todo-with-tests"
mkdir -p "$PROJ4/scripts/test" "$PROJ4/src"
git init -q "$PROJ4"
cat > "$PROJ4/TODO.md" <<'EOF'
- [ ] T030: Do something
- [ ] T031: Do another thing
EOF
echo "x" > "$PROJ4/scripts/test/test-T030-something.sh"
echo "x" > "$PROJ4/src/app.js"

OUTPUT=$(run_gate "$PROJ4" "$PROJ4/src/app.js")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "TODO.md project with at least one test file passes"
else
  fail "TODO.md with test files should pass: $OUTPUT"
fi

# 5. TODO.md-only project with NO test files — should block
PROJ5="$TMPDIR/proj-todo-no-tests"
mkdir -p "$PROJ5/src"
git init -q "$PROJ5"
cat > "$PROJ5/TODO.md" <<'EOF'
- [ ] T040: Untested task
- [ ] T041: Also untested
EOF
echo "x" > "$PROJ5/src/app.js"

OUTPUT=$(run_gate "$PROJ5" "$PROJ5/src/app.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "TODO.md project with no test files blocks"
else
  fail "TODO.md without tests should block: $OUTPUT"
fi

# 6. Allowed files bypass the gate
OUTPUT=$(run_gate "$PROJ5" "$PROJ5/TODO.md")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "TODO.md itself is allowed through gate"
else
  fail "TODO.md should be allowed: $OUTPUT"
fi

# 7. Block message mentions auto-detect option
OUTPUT=$(run_gate "$PROJ3" "$PROJ3/src/app.js")
if echo "$OUTPUT" | grep -q "scripts/test/test-TXXX"; then
  pass "Block message mentions auto-detect pattern"
else
  fail "Block message should mention auto-detect: $OUTPUT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
