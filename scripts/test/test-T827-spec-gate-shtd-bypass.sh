#!/usr/bin/env bash
# Test T827: spec-gate blocks TODO.md-only fallback when shtd workflow is enabled
set -euo pipefail
export SPEC_GATE_ACTIVE=1  # T624: force activation for testing
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: T827 spec-gate shtd bypass fix ==="

HELPER="$REPO_DIR/scripts/test/.spec-gate-t827-helper.js"
cat > "$HELPER" <<'JSEOF'
var path = require("path");
var pdir = path.resolve(process.argv[2]);
var tfile = path.resolve(process.argv[3]);
var branch = process.argv[4] || "";
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "spec-gate.js");
// Clear all caches to ensure fresh state
delete require.cache[require.resolve(modPath)];
Object.keys(require.cache).forEach(function(k) {
  if (k.indexOf("workflow") !== -1 || k.indexOf("spec-gate") !== -1) delete require.cache[k];
});
process.env.CLAUDE_PROJECT_DIR = pdir;
try {
  var mod = require(modPath);
  var result = mod({
    tool_name: "Edit",
    tool_input: { file_path: tfile },
    _git: { branch: branch }
  });
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
ORIG_HOME="${HOME}"
trap 'rm -rf "$TMPDIR" "$HELPER"; export HOME="$ORIG_HOME"' EXIT

run_gate() {
  node "$HELPER" "$1" "$2" "$3" 2>&1 || true
}

# Setup: create a fake HOME with shtd workflow enabled
FAKE_HOME="$TMPDIR/fakehome"
mkdir -p "$FAKE_HOME/.claude/hooks"
echo '{"shtd": true}' > "$FAKE_HOME/.claude/hooks/workflow-config.json"

# --- Test 1: shtd enabled + TODO.md only + no specs → BLOCK ---
PROJ1="$TMPDIR/proj-t827-1"
mkdir -p "$PROJ1/src"
git init -q "$PROJ1"
cat > "$PROJ1/TODO.md" <<'EOF'
- [ ] T2000: Build the feature
EOF
echo "x" > "$PROJ1/src/app.js"
(cd "$PROJ1" && git add -A && git commit -q -m "init") || true

export HOME="$FAKE_HOME"
OUTPUT=$(run_gate "$PROJ1" "$PROJ1/src/app.js" "600-T2000-build-feature")
export HOME="$ORIG_HOME"
if echo "$OUTPUT" | grep -q "BLOCKED.*shtd"; then
  pass "shtd enabled + TODO.md only → blocked"
else
  fail "Should block when shtd enabled and only TODO.md: $OUTPUT"
fi

# --- Test 2: shtd enabled + TODO.md + full spec chain → PASS ---
PROJ2="$TMPDIR/proj-t827-2"
mkdir -p "$PROJ2/specs/build-feature" "$PROJ2/src"
git init -q "$PROJ2"
cat > "$PROJ2/TODO.md" <<'EOF'
- [ ] T2001: Build feature v2
EOF
echo "# Spec" > "$PROJ2/specs/build-feature/spec.md"
cat > "$PROJ2/specs/build-feature/tasks.md" <<'EOF'
- [ ] T2001: Build it
EOF
echo "x" > "$PROJ2/src/app.js"
(cd "$PROJ2" && git add -A && git commit -q -m "init") || true

export HOME="$FAKE_HOME"
# Clear cache between tests
OUTPUT=$(run_gate "$PROJ2" "$PROJ2/src/app.js" "601-T2001-build-feature")
export HOME="$ORIG_HOME"
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "shtd enabled + full spec chain → allowed"
else
  fail "Should allow when full spec chain exists: $OUTPUT"
fi

# --- Test 3: shtd DISABLED + TODO.md only → PASS (backward compat) ---
FAKE_HOME2="$TMPDIR/fakehome2"
mkdir -p "$FAKE_HOME2/.claude/hooks"
echo '{"shtd": false}' > "$FAKE_HOME2/.claude/hooks/workflow-config.json"

PROJ3="$TMPDIR/proj-t827-3"
mkdir -p "$PROJ3/src"
git init -q "$PROJ3"
cat > "$PROJ3/TODO.md" <<'EOF'
- [ ] T2002: Simple task
EOF
echo "x" > "$PROJ3/src/app.js"
(cd "$PROJ3" && git add -A && git commit -q -m "init") || true

export HOME="$FAKE_HOME2"
OUTPUT=$(run_gate "$PROJ3" "$PROJ3/src/app.js" "602-T2002-simple-task")
export HOME="$ORIG_HOME"
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "shtd disabled + TODO.md only → allowed (backward compat)"
else
  fail "Should allow TODO.md fallback when shtd is disabled: $OUTPUT"
fi

# --- Test 4: shtd enabled + no workflow-config.json → PASS (no config = not enabled) ---
FAKE_HOME3="$TMPDIR/fakehome3"
mkdir -p "$FAKE_HOME3/.claude/hooks"
# No workflow-config.json

PROJ4="$TMPDIR/proj-t827-4"
mkdir -p "$PROJ4/src"
git init -q "$PROJ4"
cat > "$PROJ4/TODO.md" <<'EOF'
- [ ] T2003: No config task
EOF
echo "x" > "$PROJ4/src/app.js"
(cd "$PROJ4" && git add -A && git commit -q -m "init") || true

export HOME="$FAKE_HOME3"
OUTPUT=$(run_gate "$PROJ4" "$PROJ4/src/app.js" "603-T2003-no-config")
export HOME="$ORIG_HOME"
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "No workflow-config.json → TODO.md fallback allowed"
else
  fail "Should allow when no workflow config exists: $OUTPUT"
fi

# --- Test 5: Block message includes standard format ---
export HOME="$FAKE_HOME"
OUTPUT=$(run_gate "$PROJ1" "$PROJ1/src/app.js" "600-T2000-build-feature")
export HOME="$ORIG_HOME"
if echo "$OUTPUT" | grep -q "NEXT STEPS"; then
  pass "Block message includes NEXT STEPS"
else
  fail "Block message should include NEXT STEPS: $OUTPUT"
fi

if echo "$OUTPUT" | grep -q "FALSE POSITIVE"; then
  pass "Block message includes FALSE POSITIVE escape"
else
  fail "Block message should include FALSE POSITIVE: $OUTPUT"
fi

# --- Test 6: shtd enabled + TODO.md + incomplete spec chain → BLOCK ---
PROJ6="$TMPDIR/proj-t827-6"
mkdir -p "$PROJ6/specs/widget" "$PROJ6/src"
git init -q "$PROJ6"
cat > "$PROJ6/TODO.md" <<'EOF'
- [ ] T2004: Build widget
EOF
echo "# Widget Spec" > "$PROJ6/specs/widget/spec.md"
# Deliberately NO tasks.md — incomplete chain
echo "x" > "$PROJ6/src/widget.js"
(cd "$PROJ6" && git add -A && git commit -q -m "init") || true

export HOME="$FAKE_HOME"
OUTPUT=$(run_gate "$PROJ6" "$PROJ6/src/widget.js" "604-T2004-build-widget")
export HOME="$ORIG_HOME"
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "shtd enabled + incomplete spec chain + TODO.md → blocked"
else
  fail "Should block when spec chain is incomplete under shtd: $OUTPUT"
fi

# --- Test 7: shtd enabled + TODO.md + spec with all tasks done → BLOCK ---
# (no spec has unchecked tasks, so anyFullChain is false)
PROJ7="$TMPDIR/proj-t827-7"
mkdir -p "$PROJ7/specs/done-feature" "$PROJ7/src"
git init -q "$PROJ7"
cat > "$PROJ7/TODO.md" <<'EOF'
- [ ] T2005: New work
EOF
echo "# Done Feature" > "$PROJ7/specs/done-feature/spec.md"
cat > "$PROJ7/specs/done-feature/tasks.md" <<'EOF'
- [x] T900: All done
EOF
echo "x" > "$PROJ7/src/app.js"
(cd "$PROJ7" && git add -A && git commit -q -m "init") || true

export HOME="$FAKE_HOME"
OUTPUT=$(run_gate "$PROJ7" "$PROJ7/src/app.js" "605-T2005-new-work")
export HOME="$ORIG_HOME"
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "shtd enabled + all spec tasks done + TODO.md → blocked"
else
  fail "Should block when all spec tasks done under shtd: $OUTPUT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $((FAIL > 0 ? 1 : 0))
