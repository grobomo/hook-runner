# T391: Fix run-hidden.js — spawnSync + output logging

## WHY

T387 added `run-hidden.js` to hide hook console windows on Windows using
`windowsHide: true`. It works — hook windows are invisible. But it uses async
`spawn`, which creates a child process that can outlive the parent. When Claude
Code detects orphaned children after a hook exits, it runs
`cmd.exe /d /s /c "taskkill /pid X /T /F"` to clean up — and THAT cmd.exe
appears as a visible popup. Trading one popup for another.

ProcMon + parent-chain tracing confirmed: every taskkill popup traces back to
`claude.exe` directly (not hooks), fired after hook completion to reap orphans.

## Root cause

`run-hidden.js` uses async `cp.spawn()` + event listeners. Between the child
process finishing its work and the `close` event firing, there's a timing window
where:
- The child's grandchildren (git, curl from modules) may still be winding down
- Claude Code's 5s hook timeout may fire, triggering taskkill
- Windows recycles child PIDs, taskkill hits unrelated processes → "Access denied"

## Fix

Replace async `spawn` with synchronous `spawnSync`. When `spawnSync` returns,
the entire child process tree is dead. No orphans. No taskkill. No popup.

Also add output logging to `~/.system-monitor/hook-output.log` — CMD windows
flash too fast to read, so log everything for post-hoc debugging.

## What changes

1. `run-hidden.js`: async spawn → spawnSync + output logging
2. `constants.js`: add run-hidden.js to RUNNER_FILES (was missing — never got
   installed by setup.js)
3. TODO.md: document T391

## Not changed

- settings.json hook commands (still use run-hidden.js wrapper — it works)
- All other T385-T389 fixes (independent, correct)
- No registry changes (user preference: don't affect all of Windows)
