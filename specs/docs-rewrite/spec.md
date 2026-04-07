# Docs Rewrite (Issue #194)

## Problem
README has stale framing from early versions:
- Presents workflows as a "team" feature — they're for individuals first
- Suggests adding hooks to settings.json — hook-runner's whole point is you never touch settings.json after install
- "Why hook-runner" section frames workflows as team standards scaling — should frame as personal organization + portability
- Some counts and examples reflect older module catalog

## Changes
1. Reframe "Why hook-runner" — individual productivity, not team scaling
2. Remove all "add to settings.json" suggestions — hook-runner IS the replacement
3. Workflows = enable/disable groups of modules + portable configs, not team management
4. Update any stale counts or examples
5. Keep technical accuracy (module contract, CLI reference, architecture)

## Verification
- README renders correctly on GitHub
- No references to editing settings.json for hooks
- No "team" framing for workflows (mention teams only as secondary benefit)
- Close issue #194
