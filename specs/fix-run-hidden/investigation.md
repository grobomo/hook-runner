# T390 Investigation Log

## Source
Investigation conducted from system-monitor project (2026-04-09 session).
User reported CMD popups and PC lockup from hook-runner process spam.

## Process spam analysis (ProcMon evidence)

### Category A: Hook-runner git spawns
Every PreToolUse hook (Edit/Write/Bash) across all Claude sessions spawns:
- `git config --get branch.<name>.remote` (run-pretooluse.js line 40)
- `git rev-list --count HEAD -- <file>` (preserve-iterated-content.js)
- With 3+ concurrent Claude sessions, this produces constant cmd.exe churn

### Category B: Claude Code internal process management
ProcMon + parent-chain tracing confirmed these come from claude.exe directly:
- `taskkill /pid X /T /F` — process tree cleanup after hook execution
- `findstr /I "Code.exe Cursor.exe Windsurf.exe idea64.exe pycharm64..."` — IDE detection
- `tasklist` — process enumeration

Parent chain trace (captured via scripts/who-spawns-taskkill.ps1):
```
cmd.exe → taskkill /pid 30924 /T /F
  parent: claude.exe (PID 25844)
    parent: powershell.exe
      parent: WindowsTerminal.exe
        parent: explorer.exe
```

## Why taskkill popups appear

T387 added run-hidden.js which uses async `cp.spawn()` to re-launch runners
with `windowsHide: true`. This hides the hook's own console window, BUT:

1. Async spawn creates a child process tree (run-hidden.js → node runner → git/curl)
2. When run-hidden.js exits, grandchildren may still be winding down
3. Claude Code detects orphaned children and runs `cmd.exe /d /s /c "taskkill /pid X /T /F"`
4. That cleanup cmd.exe is spawned by Claude Code itself — NOT through run-hidden.js
5. So it has no `windowsHide` flag → Windows Terminal intercepts it → visible popup
6. The `/T` flag walks the process tree, hitting conhost.exe and recycled PIDs → "Access is denied" × 12

Net result: run-hidden.js hides the hook window but creates a NEW visible window via taskkill.

## Fix: spawnSync

Replace async `spawn` with synchronous `spawnSync`. When spawnSync returns,
the entire child process tree is dead. No orphans → no taskkill → no popup.

Also add output logging to `~/.system-monitor/hook-output.log` — CMD windows
flash too fast to read, so capture stdout/stderr for debugging.

## Also: add run-hidden.js to RUNNER_FILES

run-hidden.js is NOT in constants.js RUNNER_FILES. setup.js `--install` never
copies it to ~/.claude/hooks/. The other Claude tab must have copied it manually.
Add it to RUNNER_FILES so installs and upgrades include it.

## Also: hook-editing-gate block message improvement

Current message says:
```
TO MODIFY HOOKS: Start a Claude session in the hook-runner project.
```

Should include the actual command:
```
TO MODIFY HOOKS: Run: python ~/Documents/ProjectsCL1/context-reset/context_reset.py --project-dir ~/Documents/ProjectsCL1/_grobomo/hook-runner
```

## Also: cwd-drift-detector gap

From the system-monitor project, Claude was able to:
- Create branch in hook-runner repo (git switch -c)
- Create specs/fix-run-hidden/spec.md and tasks.md in hook-runner
- Edit hook-runner/TODO.md

The cwd-drift-detector allows TODO.md and specs/ writes cross-project. TODO.md
makes sense (documenting cross-project work). But creating branches and writing
full spec files is doing substantive work in the wrong project. Consider:
- Only allow TODO.md writes cross-project
- Block specs/ file creation from other projects
- Block git branch operations targeting other projects

## Registry fix considered and rejected

A registry-based console delegation fix (routing orphan consoles to conhost.exe)
was investigated and specced (specs/revert-run-hidden/). User rejected it because
it modifies Windows OS-wide behavior. The spawnSync approach is scoped to
hook-runner only — no system-wide side effects.
