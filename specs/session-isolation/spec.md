# Session Isolation for Hook State Files

## Problem

Several hook modules use shared temp files in `os.tmpdir()` for cross-event state:
- `instruction-detector.js` + `instruction-to-hook-gate.js`: `.claude-instruction-pending`
- `interrupt-detector.js`: `.claude-turn-complete`, `.claude-self-analyze-cooldown`
- `troubleshoot-detector.js`: `.claude-bash-failures.json`
- `mark-turn-complete.js`: `.claude-turn-complete`

These files are shared across ALL Claude Code tabs. When Tab A sets `.claude-instruction-pending`, Tab B sees it and blocks edits — even though Tab B has nothing to do with Tab A's instruction.

## Solution

Scope all temp state files to the Claude Code session using `process.ppid` (the PID of the Claude Code process that spawned the hook). Each tab has a unique PPID.

File naming: `.claude-<name>-<ppid>` (e.g. `.claude-instruction-pending-12345`)

## Shared Helper

Create `session-state.js` in the hooks directory with:
- `getSessionFile(name)` → returns `path.join(os.tmpdir(), ".claude-" + name + "-" + process.ppid)`
- `cleanStaleFiles(name)` → scans tmpdir for `.claude-<name>-*`, removes any where the PID (extracted from filename) is no longer running

## Stale Cleanup

Add a SessionStart module `session-cleanup.js` that calls `cleanStaleFiles()` for each known state file pattern. This handles PID reuse and abandoned files from crashed sessions.

## Affected Modules

| Module | File | Event | State File |
|--------|------|-------|------------|
| instruction-detector | modules/UserPromptSubmit/ | UPS | instruction-pending |
| instruction-to-hook-gate | modules/PreToolUse/ | PTU | instruction-pending |
| interrupt-detector | modules/UserPromptSubmit/ | UPS | turn-complete, self-analyze-cooldown |
| mark-turn-complete | modules/Stop/ | Stop | turn-complete |
| troubleshoot-detector | modules/PostToolUse/ | PostToolUse | bash-failures |
