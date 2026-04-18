#!/usr/bin/env bash
# Test: OpenClaw plugin install/uninstall (T474)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
INSTALL_SCRIPT="$REPO_DIR/openclaw-plugin/install.sh"

pass=0 fail=0
ok() { if [ "$2" = "0" ]; then ((pass++)); echo "PASS: $1"; else ((fail++)); echo "FAIL: $1"; fi; }

# Use a temp dir as fake OpenClaw home
TMPDIR_OC="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_OC"' EXIT

FAKE_PLUGINS="$TMPDIR_OC/plugins"
mkdir -p "$FAKE_PLUGINS"

# Test: install to custom OPENCLAW_HOME
OPENCLAW_HOME="$TMPDIR_OC" bash "$INSTALL_SCRIPT" 2>&1
DEST="$FAKE_PLUGINS/hook-runner-gates"

ok "install creates plugin directory" "$([ -d "$DEST" ] && echo 0 || echo 1)"
ok "install copies openclaw.plugin.json" "$([ -f "$DEST/openclaw.plugin.json" ] && echo 0 || echo 1)"
ok "install copies package.json" "$([ -f "$DEST/package.json" ] && echo 0 || echo 1)"
ok "install copies index.ts" "$([ -f "$DEST/index.ts" ] && echo 0 || echo 1)"
ok "install copies README.md" "$([ -f "$DEST/README.md" ] && echo 0 || echo 1)"

# Test: plugin.json has correct id
PLUGIN_ID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$DEST/openclaw.plugin.json','utf8')).id)")
ok "plugin id is hook-runner-gates" "$([ "$PLUGIN_ID" = "hook-runner-gates" ] && echo 0 || echo 1)"

# Test: index.ts has before_tool_call
grep -q "before_tool_call" "$DEST/index.ts"
ok "index.ts exports before_tool_call" "$?"

# Test: reinstall overwrites cleanly
OPENCLAW_HOME="$TMPDIR_OC" bash "$INSTALL_SCRIPT" 2>&1
ok "reinstall succeeds" "$?"

# Test: uninstall removes directory
OPENCLAW_HOME="$TMPDIR_OC" bash "$INSTALL_SCRIPT" --uninstall 2>&1
ok "uninstall removes plugin dir" "$([ ! -d "$DEST" ] && echo 0 || echo 1)"

# Test: uninstall on missing dir doesn't error
OPENCLAW_HOME="$TMPDIR_OC" bash "$INSTALL_SCRIPT" --uninstall 2>&1
ok "uninstall on missing dir is safe" "$?"

# Test: install without OPENCLAW_HOME and no ~/.openclaw
ORIG_HOME="$HOME"
HOME="$TMPDIR_OC/fakehome" bash "$INSTALL_SCRIPT" 2>&1 && EXITCODE=0 || EXITCODE=$?
ok "install without openclaw dir fails gracefully" "$([ "$EXITCODE" != "0" ] && echo 0 || echo 1)"

echo ""
echo "=== Results: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ] || exit 1
