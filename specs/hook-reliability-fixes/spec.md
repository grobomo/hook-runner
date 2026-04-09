# Hook Reliability Fixes

## Problem

Three bugs found during live debugging session on 2026-04-09:

### T385: Stop runner exit code (regression from T376)
The T376 refactor (PR #245) changed the Stop runner to collect blocks and output them after all modules run. The old code had `process.exit(0)` inline with each block — already wrong per CLAUDE.md ("Runners must use exit(1) for blocks so the TUI shows the block"). The refactor preserved the wrong exit code in the new `handleDone` callback. Result: the autocontinue instruction from `auto-continue.js` is written to stdout but the TUI ignores it because exit code 0 means "no block".

### T386: git-destructive-guard single-file gap
`git-destructive-guard.js` line 26 pattern `/git\s+(checkout|restore)\s+\.\s*$/` only matches `git checkout .` (blanket discard). `git checkout <filename>` also discards uncommitted changes to that file but is not caught. Claude attempted `git checkout run-stop.js` to revert an edit — destructive, unblocked.

### T387: Hook cmd.exe focus steal on Windows
Every hook invocation spawns a visible `cmd.exe` window on Windows because `settings.json` hook commands use bare `node "path"`. On Windows, Claude Code's shell spawner creates a console window that briefly steals focus. This fires on every PreToolUse, PostToolUse, Stop, and SessionStart event — dozens of times per session. The fix needs to wrap commands so they run with hidden windows (e.g., `cmd /c start /min` or VBScript `CreateObject("WScript.Shell").Run ... 0`).

## Solution

### T385
Change `run-stop.js` line 46: `process.exit(0)` → `process.exit(1)`.

### T386
Expand the regex in `git-destructive-guard.js` to also catch `git checkout <path>` and `git restore <path>` (single files, not just `.`). Allow `git checkout -b` (branch creation) and `git checkout <branch>` (branch switching) which are non-destructive.

### T387
Investigate how Claude Code spawns hook commands on Windows. Options:
1. Wrap hook commands in a VBScript/PowerShell hidden launcher
2. Use `setup.js` to generate platform-appropriate commands in settings.json
3. Add a launcher script (e.g., `run-hidden.vbs`) that setup.js installs alongside runners

### T388: Hook self-diagnostics
The stop hook was broken (exit 0 on block = TUI ignores it) and Claude had no idea until the user noticed. There's no automated check that hooks are actually working. A SessionStart module should validate:
1. All runners exit with correct codes (simulate a block, check exit code is 1)
2. All expected modules are loadable (require doesn't throw)
3. Runner stdout/stderr piping works (block JSON reaches stdout)
4. Log recent hook invocations — if a Stop block module has 0 logged blocks over many sessions, something is wrong

This catches silent failures early — at session start, not after the user notices broken behavior.

### T389: PR-first workflow gate
The current workflow allows spec and code work on branches without an open PR. The correct development flow is:
1. Receive task
2. Create PR (signals to dev team what you're working on)
3. Analyze, write spec
4. Write failing tests, implement until tests pass
5. Run e2e integration tests
6. Merge and close PR

A PreToolUse module should block Edit/Write to spec files and source code when:
- Current branch is not main
- No open PR exists for the current branch on GitHub
Exception: TODO.md and tasks.md edits are allowed (needed to create the task entries before the PR).

## Scope
- `run-stop.js` — exit code fix
- `modules/PreToolUse/git-destructive-guard.js` — regex expansion + heredoc stripping
- `run-hidden.js` + `setup.js` — hidden window wrapper for Windows
- `modules/SessionStart/hook-self-test.js` — runner validation at session start
- `modules/PreToolUse/pr-first-gate.js` — block spec/code work without open PR
- Tests for all five tasks
- Sync to live hooks after verification
