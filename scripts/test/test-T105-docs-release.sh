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

# 1. Version bumped in setup.js
check "setup.js version is 2.0.0" 'grep -q "2.0.0" "$REPO_DIR/setup.js"'

# 2. Version bumped in package.json
check "package.json version is 2.0.0" 'grep -q "2.0.0" "$REPO_DIR/package.json"'

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
