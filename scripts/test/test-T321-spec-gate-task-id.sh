#!/usr/bin/env bash
# Test T321: spec-gate enforces branch task ID matches an unchecked task
# T322: block messages include cross-project guidance
# T323: block messages include "spec before code" reminder
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: spec-gate task ID enforcement (T321-T323) ==="

# Write a Node.js helper that simulates branch context
HELPER="$REPO_DIR/scripts/test/.spec-gate-t321-helper.js"
cat > "$HELPER" <<'JSEOF'
// Usage: node .spec-gate-t321-helper.js <project_dir> <target_file> [branch]
// Exits 0 = passed (no block), 1 = blocked, 2 = error
var path = require("path");
var pdir = path.resolve(process.argv[2]);
var tfile = path.resolve(process.argv[3]);
var branch = process.argv[4] || "";
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "spec-gate.js");

// Clear require cache to get fresh module each time
delete require.cache[require.resolve(modPath)];
// Also clear workflow.js cache if loaded
Object.keys(require.cache).forEach(function(k) {
  if (k.indexOf("workflow.js") !== -1) delete require.cache[k];
});

process.env.CLAUDE_PROJECT_DIR = pdir;
try {
  var mod = require(modPath);
  var input = {
    tool_name: "Edit",
    tool_input: { file_path: tfile },
    _git: { branch: branch }
  };
  var result = mod(input);
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

# --- T321: Branch task ID enforcement ---

# 1. Branch T319 with T319 unchecked in TODO.md — should pass
PROJ1="$TMPDIR/proj-t321-1"
mkdir -p "$PROJ1/src"
git init -q "$PROJ1"
cat > "$PROJ1/TODO.md" <<'EOF'
- [ ] T319: Commit no-adhoc-commands to catalog
- [ ] T320: Add cross-project-todo-gate
EOF
echo "x" > "$PROJ1/src/app.js"

OUTPUT=$(run_gate "$PROJ1" "$PROJ1/src/app.js" "195-T319-T320-catalog-sync")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Branch T319 with T319 unchecked allows edits"
else
  fail "Branch T319 with T319 unchecked should allow: $OUTPUT"
fi

# 2. Branch T999 with NO T999 in TODO.md — should block
PROJ2="$TMPDIR/proj-t321-2"
mkdir -p "$PROJ2/src"
git init -q "$PROJ2"
cat > "$PROJ2/TODO.md" <<'EOF'
- [ ] T001: Some other task
- [x] T999: Already done
EOF
echo "x" > "$PROJ2/src/app.js"

OUTPUT=$(run_gate "$PROJ2" "$PROJ2/src/app.js" "200-T999-bogus-branch")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "Branch T999 with T999 already checked blocks edits"
else
  fail "Branch T999 (checked) should block: $OUTPUT"
fi

# 3. Branch T999 with T999 in specs/*/tasks.md unchecked — should pass
PROJ3="$TMPDIR/proj-t321-3"
mkdir -p "$PROJ3/specs/feat1" "$PROJ3/src"
git init -q "$PROJ3"
echo "# Feature 1 Spec" > "$PROJ3/specs/feat1/spec.md"
cat > "$PROJ3/specs/feat1/tasks.md" <<'EOF'
- [ ] T999: Build feature
EOF
echo "x" > "$PROJ3/src/app.js"
(cd "$PROJ3" && git add -A && git commit -q -m "init") || true

OUTPUT=$(run_gate "$PROJ3" "$PROJ3/src/app.js" "200-T999-build-feature")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Branch T999 with T999 unchecked in specs allows edits"
else
  fail "Branch T999 (unchecked in specs) should allow: $OUTPUT"
fi

# 4. Branch with no task ID pattern (main) — falls through to normal logic
PROJ4="$TMPDIR/proj-t321-4"
mkdir -p "$PROJ4/src"
git init -q "$PROJ4"
cat > "$PROJ4/TODO.md" <<'EOF'
- [ ] T001: Some task
EOF
echo "x" > "$PROJ4/src/app.js"

OUTPUT=$(run_gate "$PROJ4" "$PROJ4/src/app.js" "main")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "Branch 'main' with unchecked tasks allows edits (no task ID check)"
else
  fail "Branch 'main' should fall through to normal logic: $OUTPUT"
fi

# 5. Branch T500 with completely empty project — should block (no task source)
PROJ5="$TMPDIR/proj-t321-5"
mkdir -p "$PROJ5/src"
git init -q "$PROJ5"
echo "x" > "$PROJ5/src/app.js"

OUTPUT=$(run_gate "$PROJ5" "$PROJ5/src/app.js" "300-T500-some-feature")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "Branch T500 with no TODO.md blocks edits"
else
  fail "Branch T500 (no task source) should block: $OUTPUT"
fi

# --- T322: Cross-project guidance in block messages ---

# 6. Block message includes cross-project guidance
OUTPUT=$(run_gate "$PROJ5" "$PROJ5/src/app.js" "300-T500-some-feature")
if echo "$OUTPUT" | grep -q "CROSS-PROJECT"; then
  pass "Block message includes CROSS-PROJECT guidance (T322)"
else
  fail "Block message should include CROSS-PROJECT guidance: $(echo "$OUTPUT" | head -3)"
fi

# --- T323: "Spec before code" reminder ---

# 7. Block message includes "spec before code" reminder
if echo "$OUTPUT" | grep -q "Write the spec FIRST"; then
  pass "Block message includes 'Write the spec FIRST' reminder (T323)"
else
  fail "Block message should include spec-first reminder: $(echo "$OUTPUT" | head -3)"
fi

# 8. No-task block also includes both messages
PROJ8="$TMPDIR/proj-t321-8"
mkdir -p "$PROJ8/src"
git init -q "$PROJ8"
echo "x" > "$PROJ8/src/app.js"

OUTPUT=$(run_gate "$PROJ8" "$PROJ8/src/app.js" "main")
if echo "$OUTPUT" | grep -q "Write the spec FIRST" && echo "$OUTPUT" | grep -q "CROSS-PROJECT"; then
  pass "No-tasks block includes both T322+T323 messages"
else
  fail "No-tasks block should include both messages: $(echo "$OUTPUT" | head -3)"
fi

# --- T363: Subtask detection ---

# 9. Branch T331 with T331 checked but T331e unchecked in specs — should pass
PROJ9="$TMPDIR/proj-t363-1"
mkdir -p "$PROJ9/specs/brain-bridge" "$PROJ9/src"
git init -q "$PROJ9"
cat > "$PROJ9/TODO.md" <<'EOF'
- [x] T331: Brain bridge complete (PR #227)
EOF
cat > "$PROJ9/specs/brain-bridge/spec.md" <<'EOF'
# Brain bridge spec
EOF
cat > "$PROJ9/specs/brain-bridge/tasks.md" <<'EOF'
- [x] T331a: Add callBrain function (PR #227)
- [x] T331b: Add health check (PR #227)
- [ ] T331e: Version bump and CHANGELOG
EOF
echo "x" > "$PROJ9/src/app.js"
(cd "$PROJ9" && git add -A && git commit -q -m "init") || true

OUTPUT=$(run_gate "$PROJ9" "$PROJ9/src/app.js" "228-T331-version-bump")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "T363: Branch T331 with T331e unchecked in specs allows edits"
else
  fail "T363: Branch T331 with unchecked subtask T331e should allow: $OUTPUT"
fi

# 10. Branch T331 with ALL subtasks checked — should block
PROJ10="$TMPDIR/proj-t363-2"
mkdir -p "$PROJ10/specs/brain-bridge" "$PROJ10/src"
git init -q "$PROJ10"
cat > "$PROJ10/TODO.md" <<'EOF'
- [x] T331: Brain bridge complete (PR #227)
EOF
cat > "$PROJ10/specs/brain-bridge/spec.md" <<'EOF'
# Brain bridge spec
EOF
cat > "$PROJ10/specs/brain-bridge/tasks.md" <<'EOF'
- [x] T331a: Add callBrain function (PR #227)
- [x] T331b: Add health check (PR #227)
- [x] T331e: Version bump and CHANGELOG (PR #228)
EOF
echo "x" > "$PROJ10/src/app.js"
(cd "$PROJ10" && git add -A && git commit -q -m "init") || true

OUTPUT=$(run_gate "$PROJ10" "$PROJ10/src/app.js" "228-T331-version-bump")
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "T363: Branch T331 with all subtasks checked blocks edits"
else
  fail "T363: Branch T331 with all subtasks checked should block: $OUTPUT"
fi

# --- T374: Task ID match takes priority over fuzzy word matching ---

# 11. Branch T373 with "review" in name + unrelated specs/code-review-cleanup (all done)
#     T373 is unchecked in specs/module-review/tasks.md — should pass (not match code-review-cleanup)
PROJ11="$TMPDIR/proj-t374-1"
mkdir -p "$PROJ11/specs/code-review-cleanup" "$PROJ11/specs/module-review" "$PROJ11/src"
git init -q "$PROJ11"
cat > "$PROJ11/specs/code-review-cleanup/spec.md" <<'EOF'
# Code review cleanup spec
EOF
cat > "$PROJ11/specs/code-review-cleanup/tasks.md" <<'EOF'
- [x] T362: Code review pass — all done
EOF
cat > "$PROJ11/specs/module-review/spec.md" <<'EOF'
# Module review dashboard spec
EOF
cat > "$PROJ11/specs/module-review/tasks.md" <<'EOF'
- [ ] T373: Add Module Review dashboard to HTML report
EOF
echo "x" > "$PROJ11/src/report.js"
(cd "$PROJ11" && git add -A && git commit -q -m "init") || true

OUTPUT=$(run_gate "$PROJ11" "$PROJ11/src/report.js" "242-T373-module-review-tab")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "T374: Task ID in spec takes priority over fuzzy 'review' match"
else
  fail "T374: Branch T373 should use specs/module-review (not code-review-cleanup): $OUTPUT"
fi

# 12. Branch T375 with "review" in name + T375 only in TODO.md (not in any spec)
#     specs/code-review-cleanup has all tasks done — should still pass via TODO.md
PROJ12="$TMPDIR/proj-t374-2"
mkdir -p "$PROJ12/specs/code-review-cleanup" "$PROJ12/src"
git init -q "$PROJ12"
cat > "$PROJ12/TODO.md" <<'EOF'
- [ ] T375: Review the deployment process
EOF
cat > "$PROJ12/specs/code-review-cleanup/spec.md" <<'EOF'
# Code review cleanup spec
EOF
cat > "$PROJ12/specs/code-review-cleanup/tasks.md" <<'EOF'
- [x] T362: Code review pass — all done
EOF
echo "x" > "$PROJ12/src/deploy.js"
(cd "$PROJ12" && git add -A && git commit -q -m "init") || true

OUTPUT=$(run_gate "$PROJ12" "$PROJ12/src/deploy.js" "243-T375-review-deploy")
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "T374: Task ID in TODO.md skips fuzzy spec matching"
else
  fail "T374: Branch T375 (in TODO.md) should skip fuzzy match on code-review-cleanup: $OUTPUT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
