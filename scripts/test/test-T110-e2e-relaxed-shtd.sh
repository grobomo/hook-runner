#!/usr/bin/env bash
# Test T110: End-to-end relaxed SHTD workflow — single instance with TODO.md
# Simulates: TODO.md tasks → test files → branch → implement → PR allowed
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: e2e relaxed SHTD (T110) ==="

# Node.js gate runner helper
HELPER="$REPO_DIR/scripts/test/.e2e-gate-helper.js"
cat > "$HELPER" <<'JSEOF'
// Usage: node helper.js <module_name> <project_dir> <tool_name> <json_input>
var path = require("path");
var modName = process.argv[2];
var pdir = path.resolve(process.argv[3]);
var toolName = process.argv[4];
var inputStr = process.argv[5] || "{}";
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", modName + ".js");

process.env.CLAUDE_PROJECT_DIR = pdir;
process.chdir(pdir);

try {
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);
  var toolInput = JSON.parse(inputStr);
  var result = mod({ tool_name: toolName, tool_input: toolInput });
  if (result && result.decision === "block") {
    process.stdout.write("BLOCKED");
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

# Set up a project that uses TODO.md (no specs/)
PROJ="$TMPDIR/my-project"
mkdir -p "$PROJ/src" "$PROJ/scripts/test"
git init -q "$PROJ"
git -C "$PROJ" commit --allow-empty -m "init" -q

# --- Step 1: Spec gate with TODO.md ---
# No TODO.md yet — spec-gate should block
OUTPUT=$(node "$HELPER" spec-gate "$PROJ" Edit '{"file_path":"'"$PROJ"'/src/app.js"}' 2>&1) || true
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "spec-gate blocks without TODO.md"
else
  fail "spec-gate should block without TODO.md: $OUTPUT"
fi

# Add TODO.md with tasks
cat > "$PROJ/TODO.md" <<'EOF'
# Project Tasks
- [ ] T001: Build the widget
- [ ] T002: Add widget tests
EOF

# Now spec-gate should pass
OUTPUT=$(node "$HELPER" spec-gate "$PROJ" Edit '{"file_path":"'"$PROJ"'/src/app.js"}' 2>&1) || true
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "spec-gate passes with TODO.md tasks"
else
  fail "spec-gate should pass with TODO.md: $OUTPUT"
fi

# --- Step 2: Test checkpoint gate ---
# No test files yet — should block
OUTPUT=$(node "$HELPER" test-checkpoint-gate "$PROJ" Edit '{"file_path":"'"$PROJ"'/src/app.js"}' 2>&1) || true
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "test-checkpoint-gate blocks without test files"
else
  fail "test-checkpoint-gate should block without tests: $OUTPUT"
fi

# Add test file for T001
printf '#!/usr/bin/env bash\necho "T001 test passed"\nexit 0\n' > "$PROJ/scripts/test/test-T001-widget.sh"
chmod +x "$PROJ/scripts/test/test-T001-widget.sh"

# Now test-checkpoint-gate should pass (at least one task has test)
OUTPUT=$(node "$HELPER" test-checkpoint-gate "$PROJ" Edit '{"file_path":"'"$PROJ"'/src/app.js"}' 2>&1) || true
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "test-checkpoint-gate passes with test file"
else
  fail "test-checkpoint-gate should pass with test: $OUTPUT"
fi

# --- Step 3: Worker loop — PR creation gated on test ---
git -C "$PROJ" checkout -b 001-T001-widget 2>/dev/null

# Worker loop should allow PR (test passes)
OUTPUT=$(node "$HELPER" worker-loop "$PROJ" Bash '{"command":"gh pr create --title T001: widget"}' 2>&1) || true
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "worker-loop allows PR when test passes"
else
  fail "worker-loop should allow PR: $OUTPUT"
fi

# Add a failing test for T002 and switch branch
git -C "$PROJ" checkout -b 001-T002-tests 2>/dev/null
printf '#!/usr/bin/env bash\necho "T002 FAILED"\nexit 1\n' > "$PROJ/scripts/test/test-T002-tests.sh"
chmod +x "$PROJ/scripts/test/test-T002-tests.sh"

# Worker loop should block PR (test fails)
OUTPUT=$(node "$HELPER" worker-loop "$PROJ" Bash '{"command":"gh pr create --title T002: tests"}' 2>&1) || true
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "worker-loop blocks PR when test fails"
else
  fail "worker-loop should block PR on failing test: $OUTPUT"
fi

# Fix the test
printf '#!/usr/bin/env bash\necho "T002 test passed"\nexit 0\n' > "$PROJ/scripts/test/test-T002-tests.sh"

# Now PR should be allowed
OUTPUT=$(node "$HELPER" worker-loop "$PROJ" Bash '{"command":"gh pr create --title T002: tests"}' 2>&1) || true
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "worker-loop allows PR after test fix"
else
  fail "worker-loop should allow PR after fix: $OUTPUT"
fi

# --- Step 4: Allowed file bypass ---
# All gates should allow TODO.md edits
for gate in spec-gate test-checkpoint-gate; do
  OUTPUT=$(node "$HELPER" "$gate" "$PROJ" Edit '{"file_path":"'"$PROJ"'/TODO.md"}' 2>&1) || true
  if echo "$OUTPUT" | grep -q "PASSED"; then
    pass "$gate allows TODO.md edits"
  else
    fail "$gate should allow TODO.md: $OUTPUT"
  fi
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
