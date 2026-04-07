# Session Collision Detection

## Problem

Context-reset spawns new Claude Code tabs without killing the old one. Multiple sessions
work on the same project simultaneously, causing:
- Git branch switching under each other's feet
- index.lock contention (fatal errors on every git operation)
- Parallel commits stomping each other
- Race conditions in file edits

On 2026-04-07, the user returned to find 4-5 simultaneous tabs all working on hook-runner.

## Solution: Belt and Suspenders

### Belt: Hook-based (this spec)
SessionStart module writes a lock file per project+PID in tmpdir. On start, scans for
other active lock files on the same project. If found, warns loudly with PIDs and branches
so the user can close duplicates.

Lock file: `.claude-session-lock-<project-hash>-<ppid>` in tmpdir.
- Written at SessionStart
- Cleaned up by session-cleanup.js (stale PID check)
- Read by this module to detect collisions

### Suspenders: system-monitor (T027 in that project)
Process-level detection via Win32 API — scan running node.exe processes, group by
CLAUDE_PROJECT_DIR, flag projects with 2+ active sessions. Dashboard panel + API endpoint.

## Affected Modules
- NEW: `modules/SessionStart/session-collision-detector.js`
- UPDATE: `modules/SessionStart/session-cleanup.js` — add lock file pattern to cleanup list
