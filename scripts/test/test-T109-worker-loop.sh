#!/usr/bin/env bash
# Test T109: worker-loop module — blocks PR creation until test passes
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: worker-loop (T109) ==="

# Helper script
HELPER="$REPO_DIR/scripts/test/.worker-loop-helper.js"
cat > "$HELPER" <<'JSEOF'
// Usage: node .worker-loop-helper.js <project_dir> <command>
var path = require("path");
var pdir = path.resolve(process.argv[2]);
var cmd = process.argv.slice(3).join(" ");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "worker-loop.js");

process.env.CLAUDE_PROJECT_DIR = pdir;
process.chdir(pdir);

try {
  delete require.cache[require.resolve(modPath)];
  var mod = require(modPath);
  var result = mod({ tool_name: "Bash", tool_input: { command: cmd } });
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

# git init with CI-safe config
git_init() {
  git init -q "$1"
  git -C "$1" config user.email "test@test.com"
  git -C "$1" config user.name "test"
  git -C "$1" commit --allow-empty -m "init" -q
}

# 1. Module loads and exports a function
OUTPUT=$(node -e "var m = require('$REPO_DIR/modules/PreToolUse/worker-loop.js'); if (typeof m !== 'function') throw new Error('not a function')" 2>&1) || true
if [ -z "$OUTPUT" ]; then
  pass "module exports a function"
else
  fail "module should export function: $OUTPUT"
fi

# 2. Non-PR commands pass through
OUTPUT=$(node "$HELPER" "$REPO_DIR" "echo hello" 2>&1) || true
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "non-PR commands pass through"
else
  fail "non-PR commands should pass: $OUTPUT"
fi

# 3. gh pr create on branch without task ID passes (no match)
PROJ3="$TMPDIR/proj-no-task"
mkdir -p "$PROJ3"
git_init "$PROJ3"
git -C "$PROJ3" checkout -b some-feature 2>/dev/null
OUTPUT=$(node "$HELPER" "$PROJ3" "gh pr create --title test" 2>&1) || true
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "branch without task ID passes through"
else
  fail "no task ID should pass: $OUTPUT"
fi

# 4. gh pr create with passing test allows PR
PROJ4="$TMPDIR/proj-pass"
mkdir -p "$PROJ4/scripts/test" "$PROJ4/src"
git_init "$PROJ4"
git -C "$PROJ4" checkout -b 001-T050-feat 2>/dev/null
printf '#!/usr/bin/env bash\nexit 0\n' > "$PROJ4/scripts/test/test-T050-feat.sh"
chmod +x "$PROJ4/scripts/test/test-T050-feat.sh"
echo "x" > "$PROJ4/src/app.js"

OUTPUT=$(node "$HELPER" "$PROJ4" "gh pr create --title 'T050: feat'" 2>&1) || true
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "passing test allows PR creation"
else
  fail "passing test should allow PR: $OUTPUT"
fi

# 5. Marker file created after passing test
if ls "$PROJ4/.test-results/T050.passed" >/dev/null 2>&1 || ls "$PROJ4"/.test-results/T050.passed >/dev/null 2>&1; then
  pass "marker file created after test pass"
else
  fail "marker file should be created"
fi

# 6. gh pr create with failing test blocks PR
PROJ6="$TMPDIR/proj-fail"
mkdir -p "$PROJ6/scripts/test" "$PROJ6/src"
git_init "$PROJ6"
git -C "$PROJ6" checkout -b 001-T060-buggy 2>/dev/null
printf '#!/usr/bin/env bash\necho "ASSERTION FAILED"\nexit 1\n' > "$PROJ6/scripts/test/test-T060-buggy.sh"
chmod +x "$PROJ6/scripts/test/test-T060-buggy.sh"

OUTPUT=$(node "$HELPER" "$PROJ6" "gh pr create --title 'T060: buggy'" 2>&1) || true
if echo "$OUTPUT" | grep -q "BLOCKED"; then
  pass "failing test blocks PR creation"
else
  fail "failing test should block PR: $OUTPUT"
fi

# 7. Block message includes test output
if echo "$OUTPUT" | grep -q "WORKER LOOP"; then
  pass "block message identifies as WORKER LOOP"
else
  fail "block should say WORKER LOOP: $OUTPUT"
fi

# 8. No test file = pass through (test-checkpoint-gate handles that)
PROJ8="$TMPDIR/proj-no-test"
mkdir -p "$PROJ8/src"
git_init "$PROJ8"
git -C "$PROJ8" checkout -b 001-T070-notest 2>/dev/null

OUTPUT=$(node "$HELPER" "$PROJ8" "gh pr create --title 'T070: notest'" 2>&1) || true
if echo "$OUTPUT" | grep -q "PASSED"; then
  pass "no test file passes through (defers to test-checkpoint-gate)"
else
  fail "no test file should pass through: $OUTPUT"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
