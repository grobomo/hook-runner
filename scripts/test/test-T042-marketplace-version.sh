#!/usr/bin/env bash
# T042: Verify marketplace plugin.json version matches source package.json
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MARKETPLACE_DIR="$HOME/Documents/ProjectsCL1/_grobomo/ai-skill-marketplace/plugins/hook-runner"

passed=0
failed=0

pass() { echo "OK: $1"; passed=$((passed + 1)); }
fail() { echo "FAIL: $1"; failed=$((failed + 1)); }

# Skip if marketplace repo not cloned (CI environments)
if [ ! -d "$MARKETPLACE_DIR" ]; then
  echo "SKIP: marketplace repo not present (CI)"
  echo "  0 passed, 0 failed (skipped)"
  exit 0
fi

# Test 1: plugin.json exists
if [ -f "$MARKETPLACE_DIR/.claude-plugin/plugin.json" ]; then
  pass "plugin.json exists"
else
  fail "plugin.json not found at $MARKETPLACE_DIR/.claude-plugin/plugin.json"
  echo "  $passed passed, $failed failed"
  exit 1
fi

# Test 2: version in plugin.json matches package.json
SRC_FILE="$(cygpath -w "$REPO_DIR/package.json" 2>/dev/null || echo "$REPO_DIR/package.json")"
MKT_FILE="$(cygpath -w "$MARKETPLACE_DIR/.claude-plugin/plugin.json" 2>/dev/null || echo "$MARKETPLACE_DIR/.claude-plugin/plugin.json")"
SRC_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1])).version)" "$SRC_FILE")
MKT_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1])).version)" "$MKT_FILE")

if [ "$SRC_VER" = "$MKT_VER" ]; then
  pass "version match: $SRC_VER"
else
  fail "version mismatch: source=$SRC_VER marketplace=$MKT_VER"
fi

# Test 3: SKILL.md exists in marketplace
if [ -f "$MARKETPLACE_DIR/skills/hook-runner/SKILL.md" ]; then
  pass "SKILL.md exists in marketplace"
else
  fail "SKILL.md missing from marketplace"
fi

echo "  $passed passed, $failed failed"
[ "$failed" -eq 0 ] || exit 1
