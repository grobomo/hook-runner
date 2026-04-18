#!/usr/bin/env bash
# Test T484: spec-gate blocks when task is in TODO.md but matching spec dir has incomplete chain
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: T484 spec-gate TODO.md bypass fix ==="

# Helper — reuse the T321 pattern
HELPER="$REPO_DIR/scripts/test/.spec-gate-t484-helper.js"
cat > "$HELPER" <<'JSEOF'
var path = require("path");
var pdir = path.resolve(process.argv[2]);
var tfile = path.resolve(process.argv[3]);
var branch = process.argv[4] || "";
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "spec-gate.js");
delete require.cache[require.resolve(modPath)];
Object.keys(require.cache).forEach(function(k) {
  if (k.indexOf("workflow.js") !== -1) delete require.cache[k];
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
trap 'rm -rf "$TMPDIR" "$HELPER"' EXIT

run_gate() {
  node "$HELPER" "$1" "$2" "$3" 2>&1 || true
}

# --- T484: Task in TODO.md + matching spec dir with incomplete chain ---

# 1. Task in TODO, matching spec has spec.md but NO tasks.md — should BLOCK
PROJ1="$TMPDIR/proj-t484-1"
mkdir -p "$PROJ1/specs/widget-builder" "$PROJ1/src"
git init -q "$PROJ1"
cat > "$PROJ1/TODO.md" <<'EOF'
- [ ] T1010: Build widget builder feature
EOF
echo "# Widget Builder Spec" > "$PROJ1/specs/widget-builder/spec.md"
# Deliberately NO tasks.md in specs/widget-builder/
echo "x" > "$PROJ1/src/widget.js"
(cd "$PROJ1" && git add -A && git commit -q -m "init") || true

OUTPUT=$(run_gate "$PROJ1" "$PROJ1/src/widget.js" "500-T1010-widget-builder")
if echo "$OUTPUT" | grep -q "BLOCKED" && echo "$OUTPUT" | grep -q "tasks.md missing"; then
  pass "Task in TODO + matching spec without tasks.md → blocked"
else
  fail "Should block when matching spec has no tasks.md: $OUTPUT"
fi

# 2. Task in TODO, matching spec has spec.md AND tasks.md (all done) — should PASS
PROJ2="$TMPDIR/proj-t484-2"
mkdir -p "$PROJ2/specs/widget-builder" "$PROJ2/src"
git init -q "$PROJ2"
cat > "$PROJ2/TODO.md" <<'EOF'
- [ ] T1011: Widget builder v2
EOF
echo "# Widget Builder Spec" > "$PROJ2/specs/widget-builder/spec.md"
cat > "$PROJ2/specs/widget-builder/tasks.md" <<'EOF'
- [x] T1000: v1 complete
EOF
echo "x" > "$PROJ2/src/widget.js"
(cd "$PROJ2" && git add -A && git commit -q -m "init") || true

OUTPUT=$(run_gate "$PROJ2" "$PROJ2/src/widget.js" "501-T1011-widget-builder-v2")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Task in TODO + matching spec with completed tasks.md → allowed"
else
  fail "Should allow when matching spec has complete chain: $OUTPUT"
fi

# 3. Task in TODO, NO matching spec dir (different name) — should PASS
PROJ3="$TMPDIR/proj-t484-3"
mkdir -p "$PROJ3/specs/unrelated-feature" "$PROJ3/src"
git init -q "$PROJ3"
cat > "$PROJ3/TODO.md" <<'EOF'
- [ ] T1012: Build the dashboard
EOF
echo "# Unrelated" > "$PROJ3/specs/unrelated-feature/spec.md"
cat > "$PROJ3/specs/unrelated-feature/tasks.md" <<'EOF'
- [x] T900: Done
EOF
echo "x" > "$PROJ3/src/dashboard.js"
(cd "$PROJ3" && git add -A && git commit -q -m "init") || true

OUTPUT=$(run_gate "$PROJ3" "$PROJ3/src/dashboard.js" "502-T1012-dashboard-build")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Task in TODO + no fuzzy-matching spec dir → allowed"
else
  fail "Should allow when no spec dir matches branch: $OUTPUT"
fi

# 4. Task in TODO, matching spec has spec.md + tasks.md with unchecked — should PASS
PROJ4="$TMPDIR/proj-t484-4"
mkdir -p "$PROJ4/specs/widget-builder" "$PROJ4/src"
git init -q "$PROJ4"
cat > "$PROJ4/TODO.md" <<'EOF'
- [ ] T1013: Widget builder cleanup
EOF
echo "# Widget Builder Spec" > "$PROJ4/specs/widget-builder/spec.md"
cat > "$PROJ4/specs/widget-builder/tasks.md" <<'EOF'
- [ ] T1013: Cleanup
EOF
echo "x" > "$PROJ4/src/widget.js"
(cd "$PROJ4" && git add -A && git commit -q -m "init") || true

OUTPUT=$(run_gate "$PROJ4" "$PROJ4/src/widget.js" "503-T1013-widget-builder-cleanup")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Task in TODO + matching spec with full chain → allowed"
else
  fail "Should allow when matching spec has full chain: $OUTPUT"
fi

# 5. Block message mentions the matching spec dir name
OUTPUT=$(run_gate "$PROJ1" "$PROJ1/src/widget.js" "500-T1010-widget-builder")
if echo "$OUTPUT" | grep -q "widget-builder"; then
  pass "Block message names the matching spec dir"
else
  fail "Block message should mention spec dir name: $(echo "$OUTPUT" | head -3)"
fi

# 6. Task in TODO, no specs/ at all — should PASS (simple project)
PROJ6="$TMPDIR/proj-t484-6"
mkdir -p "$PROJ6/src"
git init -q "$PROJ6"
cat > "$PROJ6/TODO.md" <<'EOF'
- [ ] T1014: Simple task
EOF
echo "x" > "$PROJ6/src/app.js"

OUTPUT=$(run_gate "$PROJ6" "$PROJ6/src/app.js" "504-T1014-simple-task")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Task in TODO + no specs/ dir → allowed (simple project)"
else
  fail "Should allow simple project with just TODO.md: $OUTPUT"
fi

echo ""
echo "$PASS passed, $FAIL failed"
exit $((FAIL > 0 ? 1 : 0))
