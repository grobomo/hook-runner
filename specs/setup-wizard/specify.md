# hook-runner Setup Wizard

## Problem
Users who want to adopt the hook-runner modular system have no guided path. They must manually understand the architecture, copy files, edit settings.json, and hope they don't break their existing hooks. There's no way to see what they currently have, preview what hook-runner would look like, or safely migrate.

## Solution
A setup.js wizard (run as a custom command via the hook-runner skill) that:
1. Scans current hooks in settings.json and generates a report showing what's installed
2. Explains the hook-runner architecture and shows what it would look like
3. Asks if the user wants to convert their existing hooks to the hook-runner system
4. Backs up all existing hook files to ~/.claude/hooks/archive/ before any changes
5. Installs the hook-runner system (runners + module dirs + settings.json entries)
6. Re-runs the report to show the result and displays the archive path

## User Flow
1. User adds grobomo marketplace to Claude Code
2. User installs hook-runner skill
3. User runs setup.js (custom command)
4. Setup shows current hooks report
5. Setup shows proposed hook-runner structure
6. Setup asks for confirmation
7. Setup backs up existing files to ~/.claude/hooks/archive/
8. Setup installs runners, creates run-modules dirs, updates settings.json
9. Setup re-runs report showing new structure
10. Setup displays archive path for originals

## Non-Goals
- Don't auto-convert module logic from old hooks — just install the runner framework
- Don't delete old hook scripts — archive them
- Don't modify any hook module behavior — setup only installs infrastructure
