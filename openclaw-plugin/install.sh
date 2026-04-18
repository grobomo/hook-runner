#!/usr/bin/env bash
# Install hook-runner-gates plugin into OpenClaw
# Usage: bash openclaw-plugin/install.sh [--uninstall]
set -euo pipefail

PLUGIN_NAME="hook-runner-gates"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect OpenClaw plugins directory
if [ -n "${OPENCLAW_HOME:-}" ]; then
  PLUGINS_DIR="$OPENCLAW_HOME/plugins"
elif [ -d "$HOME/.openclaw/plugins" ]; then
  PLUGINS_DIR="$HOME/.openclaw/plugins"
else
  echo "ERROR: OpenClaw plugins directory not found."
  echo "Set OPENCLAW_HOME or ensure ~/.openclaw/plugins/ exists."
  exit 1
fi

DEST="$PLUGINS_DIR/$PLUGIN_NAME"

if [ "${1:-}" = "--uninstall" ]; then
  if [ -d "$DEST" ]; then
    rm -rf "$DEST"
    echo "Uninstalled $PLUGIN_NAME from $DEST"
  else
    echo "$PLUGIN_NAME not installed at $DEST"
  fi
  exit 0
fi

# Install
mkdir -p "$DEST"
cp "$SCRIPT_DIR/openclaw.plugin.json" "$DEST/"
cp "$SCRIPT_DIR/package.json" "$DEST/"
cp "$SCRIPT_DIR/index.ts" "$DEST/"
cp "$SCRIPT_DIR/README.md" "$DEST/"

echo "Installed $PLUGIN_NAME to $DEST"
echo ""
echo "Files:"
ls -la "$DEST/"
echo ""
echo "Verify with: openclaw plugins list"
echo "To uninstall: bash $0 --uninstall"
