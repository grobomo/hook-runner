# Tasks: Session Isolation

## T337: Session-scoped state files
- [x] T337a: ~~Create session-state.js helper~~ — not needed, inline ppid suffix is simpler
- [x] T337b: Update instruction-detector.js to use session-scoped flag file
- [x] T337c: Update instruction-to-hook-gate.js to use session-scoped flag file
- [x] T337d: Update interrupt-detector.js to use session-scoped marker + cooldown
- [x] T337e: Update mark-turn-complete.js to use session-scoped marker
- [x] T337f: Update troubleshoot-detector.js to use session-scoped state file
- [x] T337g: Add session-cleanup.js SessionStart module (clean stale flag files)
- [x] T337h: Test: verify two sessions don't interfere with each other's state
- [x] T337i: Version bump to 2.13.1 + sync live hooks
