#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "=== hook-runner: install drift detection ==="
P=0; F=0

pass() { echo "  PASS: $1"; P=$((P+1)); }
fail() { echo "  FAIL: $1"; F=$((F+1)); }

# 1. Health check includes install-version
node setup.js --health 2>&1 | grep -q "install-version" && pass "health shows install-version check" || fail "health missing install-version"

# 2. Health check includes install-files
node setup.js --health 2>&1 | grep -q "install-files" && pass "health shows install-files check" || fail "health missing install-files"

# 3. Version match shows OK (assumes skill copy was just synced)
SKILL_PKG="$HOME/.claude/skills/hook-runner/package.json"
if [ -f "$SKILL_PKG" ]; then
  REPO_VER=$(node -e "console.log(require('./package.json').version)")
  SKILL_VER=$(node -e "var p=require('path'); console.log(JSON.parse(require('fs').readFileSync(p.join(require('os').homedir(),'.claude','skills','hook-runner','package.json'),'utf-8')).version)")
  [ "$REPO_VER" = "$SKILL_VER" ] && pass "versions match: v$REPO_VER" || fail "version mismatch: repo=$REPO_VER skill=$SKILL_VER"
else
  echo "  SKIP: skill package.json not found (CI environment)"
fi

# 4. No duplicate --audit-project dispatch in main()
DUPES=$(grep -c 'indexOf("--audit-project") !== -1) return' setup.js)
[ "$DUPES" -eq 1 ] && pass "no duplicate --audit-project dispatch" || fail "found $DUPES --audit-project dispatch lines (expected 1)"

echo ""
echo "$P passed, $F failed"
[ "$F" -eq 0 ] || exit 1
