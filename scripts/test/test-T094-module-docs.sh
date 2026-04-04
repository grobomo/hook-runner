#!/usr/bin/env bash
# Test T094: Verify README documents all distributable modules
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0

check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}

echo "=== hook-runner: module documentation ==="

README="$REPO_DIR/README.md"

# Get all distributable .js modules (exclude _example-project, archive)
MODULES=$(find "$REPO_DIR/modules" -name "*.js" -not -path "*archive*" -not -path "*_example*" | while read f; do basename "$f" .js; done | sort -u)

# Check each module appears in README
MISSING=""
for mod in $MODULES; do
  if ! grep -q "$mod" "$README" 2>/dev/null; then
    MISSING="$MISSING $mod"
  fi
done

check "all modules documented in README" '[ -z "$MISSING" ]'
if [ -n "$MISSING" ]; then
  echo "    Missing:$MISSING"
fi

# Check README has all 5 event sections
for evt in PreToolUse PostToolUse UserPromptSubmit Stop SessionStart; do
  check "$evt section exists" "grep -q '### $evt' '$README'"
done

# Check module count in README roughly matches catalog
README_MODS=$(grep -c '| `[a-z]' "$README" || true)
CATALOG_COUNT=$(echo "$MODULES" | wc -w | tr -d ' ')
check "README module count ($README_MODS) close to catalog ($CATALOG_COUNT)" '[ "$README_MODS" -ge "$((CATALOG_COUNT - 5))" ]'

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
