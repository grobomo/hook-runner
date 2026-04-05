#!/usr/bin/env bash
# Test T105: Docs update + version bump
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: docs & release ==="

# Extract expected version from setup.js
EXPECTED_VER=$(grep -oP 'VERSION = "\K[^"]+' "$REPO_DIR/setup.js")

# 1. Version in setup.js matches package.json
check "setup.js version is $EXPECTED_VER" 'grep -q "\"$EXPECTED_VER\"" "$REPO_DIR/setup.js"'

# 2. package.json version matches setup.js
check "package.json version is $EXPECTED_VER" 'grep -q "\"$EXPECTED_VER\"" "$REPO_DIR/package.json"'

# 3. CLAUDE.md has updated test counts
check "CLAUDE.md has updated test counts" 'grep -qE "[0-9]+ suites" "$REPO_DIR/CLAUDE.md"'

# 4. CLAUDE.md has audit/query in workflow commands
check "CLAUDE.md has audit/query CLI docs" 'grep -q "audit" "$REPO_DIR/CLAUDE.md"'

# 5. SKILL.md has workflow command
check "SKILL.md has workflow command" 'grep -q "workflow" "$REPO_DIR/SKILL.md"'

# 6. README has workflow-summary module
check "README has workflow-summary" 'grep -q "workflow-summary" "$REPO_DIR/README.md"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
