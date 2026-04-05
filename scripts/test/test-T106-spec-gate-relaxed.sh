#!/usr/bin/env bash
# Test T106: spec-gate accepts TODO.md with `- [ ] TXXX:` as valid task source
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: spec-gate relaxed (T106) ==="

# Write a Node.js helper that handles path conversion internally
HELPER="$REPO_DIR/scripts/test/.spec-gate-helper.js"
cat > "$HELPER" <<'JSEOF'
// Usage: node .spec-gate-helper.js <project_dir> <target_file>
// Exits 0 = passed (no block), 1 = blocked, 2 = error
var path = require("path");
var pdir = path.resolve(process.argv[2]);
var tfile = path.resolve(process.argv[3]);
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "spec-gate.js");

process.env.CLAUDE_PROJECT_DIR = pdir;
try {
  var mod = require(modPath);
  var result = mod({ tool_name: "Edit", tool_input: { file_path: tfile } });
  if (result && result.decision === "block") {
    process.stdout.write("BLOCKED: " + result.reason.split("\n")[0]);
    process.exit(1);
  } else {
    process.stdout.write("PASSED");
    process.exit(0);
  }
} catch(e) {
  process.stderr.write("ERROR: " + e.message);
  process.exit(2);
}
JSEOF

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR" "$HELPER"' EXIT

run_gate() {
  node "$HELPER" "$1" "$2" 2>&1 || true
}

# 1. Project with only TODO.md containing unchecked tasks — should pass
PROJ1="$TMPDIR/proj-todo-only"
mkdir -p "$PROJ1/src"
git init -q "$PROJ1"
cat > "$PROJ1/TODO.md" <<'EOF'
# Tasks
- [ ] T001: Add feature X
- [ ] T002: Fix bug Y
EOF
echo "x" > "$PROJ1/src/app.js"

OUTPUT=$(run_gate "$PROJ1" "$PROJ1/src/app.js")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "TODO.md with unchecked tasks allows edits"
else
  fail "TODO.md with unchecked tasks should allow edits: $OUTPUT"
fi

# 2. Project with only TODO.md but all tasks checked — should block
PROJ2="$TMPDIR/proj-todo-done"
mkdir -p "$PROJ2/src"
git init -q "$PROJ2"
cat > "$PROJ2/TODO.md" <<'EOF'
# Tasks
- [x] T001: Add feature X
- [x] T002: Fix bug Y
EOF
echo "x" > "$PROJ2/src/app.js"

OUTPUT=$(run_gate "$PROJ2" "$PROJ2/src/app.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "TODO.md with all tasks checked blocks edits"
else
  fail "TODO.md with all tasks checked should block: $OUTPUT"
fi

# 3. Project with no specs/ and no TODO.md — should block
PROJ3="$TMPDIR/proj-empty"
mkdir -p "$PROJ3/src"
git init -q "$PROJ3"
echo "x" > "$PROJ3/src/app.js"

OUTPUT=$(run_gate "$PROJ3" "$PROJ3/src/app.js")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "No tasks.md and no TODO.md blocks edits"
else
  fail "No task sources should block: $OUTPUT"
fi

# 4. Project with specs/*/tasks.md + spec.md (original behavior still works)
PROJ4="$TMPDIR/proj-specs"
mkdir -p "$PROJ4/specs/feat1" "$PROJ4/src"
git init -q "$PROJ4"
echo "# Feature 1 Spec" > "$PROJ4/specs/feat1/spec.md"
cat > "$PROJ4/specs/feat1/tasks.md" <<'EOF'
- [ ] T001: Build it
EOF
echo "x" > "$PROJ4/src/app.js"
# Need at least one commit for git rev-parse HEAD to work
(cd "$PROJ4" && git add -A && git commit -q -m "init" 2>/dev/null) || true

OUTPUT=$(run_gate "$PROJ4" "$PROJ4/src/app.js")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "specs/*/tasks.md still works as task source"
else
  fail "specs/*/tasks.md should still work: $OUTPUT"
fi

# 5. Block message mentions TODO.md as alternative
OUTPUT=$(run_gate "$PROJ3" "$PROJ3/src/app.js")
if echo "$OUTPUT" | grep -q "TODO.md"; then
  pass "Block message mentions TODO.md as alternative"
else
  fail "Block message should mention TODO.md: $OUTPUT"
fi

# 6. Mixed: specs all checked but TODO.md has unchecked — should pass
PROJ6="$TMPDIR/proj-mixed"
mkdir -p "$PROJ6/specs/feat1" "$PROJ6/src"
git init -q "$PROJ6"
cat > "$PROJ6/specs/feat1/tasks.md" <<'EOF'
- [x] T001: Done
EOF
cat > "$PROJ6/TODO.md" <<'EOF'
- [ ] T099: New work in TODO
EOF
echo "x" > "$PROJ6/src/app.js"

OUTPUT=$(run_gate "$PROJ6" "$PROJ6/src/app.js")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Mixed: checked specs + unchecked TODO.md allows edits"
else
  fail "Mixed sources should pass if any has unchecked tasks: $OUTPUT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
