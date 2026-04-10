# T397: hook-system-reminder module (global PreToolUse)

## Problem
Claude repeatedly tries to create `~/.claude/rules/` files despite being told across dozens of sessions that enforcement is ONLY via hook-runner modules. The module exists in live hooks (`run-modules/PreToolUse/hook-system-reminder.js`) but was deployed without specs or tests.

## Solution
Formalize `hook-system-reminder.js` as a catalog module (`modules/PreToolUse/`) with proper tests.

## Behavior
- **Triggers on**: `Write` or `Edit` tool targeting any file in `~/.claude/`
- **Allows**: edits to `hook-runner/` source files (that's where modules live)
- **Allows**: edits to `settings.json` / `settings.local.json`
- **Blocks with reminder**: any other Write/Edit to `~/.claude/` — tells Claude about hook-runner module system, never create `.claude/rules/`

## Test Cases
1. Non-hook file (e.g. `/tmp/foo.js`) → pass
2. Write to `~/.claude/rules/never-do-x.md` → block
3. Edit to `~/.claude/hooks/run-modules/PreToolUse/some-gate.js` (hook-runner path) → pass (hook-runner edits allowed)
4. Write to `~/.claude/settings.json` → pass
5. Write to `~/.claude/settings.local.json` → pass
6. Edit to `~/.claude/CLAUDE.md` → block (not hook-runner, not settings)
7. Read tool on `~/.claude/` → pass (only Write/Edit gated)
8. Bash tool → pass (not Write/Edit)

## Files
- `modules/PreToolUse/hook-system-reminder.js` — catalog copy
- `scripts/test/test-hook-system-reminder.js` — test suite
