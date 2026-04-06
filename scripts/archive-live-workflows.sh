#!/usr/bin/env bash
# Archive workflow YAMLs from live hooks dir that no longer exist in the repo's
# workflows/ top-level. Moves them to ~/.claude/hooks/workflows/archive/.
# Usage: bash scripts/archive-live-workflows.sh [--dry-run]
set -euo pipefail

REPO_WF_DIR="$(cd "$(dirname "$0")/.." && pwd)/workflows"
LIVE_WF_DIR="$HOME/.claude/hooks/workflows"
ARCHIVE_DIR="$LIVE_WF_DIR/archive"

if [[ ! -d "$LIVE_WF_DIR" ]]; then
  echo "No live workflows dir at $LIVE_WF_DIR"
  exit 0
fi

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

mkdir -p "$ARCHIVE_DIR"

moved=0
for yml in "$LIVE_WF_DIR"/*.yml "$LIVE_WF_DIR"/*.yaml; do
  [[ -f "$yml" ]] || continue
  base="$(basename "$yml")"
  if [[ ! -f "$REPO_WF_DIR/$base" ]]; then
    if $DRY_RUN; then
      echo "[dry-run] would archive: $base"
    else
      mv "$yml" "$ARCHIVE_DIR/$base"
      echo "Archived: $base"
    fi
    moved=$((moved + 1))
  fi
done

echo "Done. $moved file(s) archived."
