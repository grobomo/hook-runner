# Runtime Hook Health Monitor

## Problem
When a hook silently fails (runner crashes, wrong path, exit code bug, timeout), nobody knows until a user notices broken behavior. The T385 exit(0) bug went undetected across multiple sessions — the stop hook appeared to work but the TUI silently discarded its output.

Existing diagnostics (project-health.js, hook-self-test.js) only run at SessionStart **inside Claude**. They check static properties (files exist, source code patterns). They can't observe runtime behavior, and they can't catch problems when Claude itself is part of the failure chain.

The PostToolUse hook-health-monitor.js (already implemented) runs inside Claude — but a hook can't reliably monitor hooks. If the system is broken, the monitor is broken too.

## Solution
Three components:

### 1. run-hidden.js invocation log (done)
Every hook invocation goes through run-hidden.js. It logs to `~/.claude/hooks/hook-health.jsonl`:

```json
{"ts":"2026-04-09T15:30:00Z","runner":"run-pretooluse.js","exit":1,"stdout":142,"stderr":0,"ms":45,"signal":null}
```

### 2. PostToolUse hook-health-monitor.js (done)
In-session anomaly detection. Best-effort — catches problems when hooks are partially working.

### 3. Watchdog health log analysis (NEW)
The watchdog (`watchdog.js`) already runs outside Claude as an OS scheduled task (every 10 minutes). It checks static config (workflows enabled, files exist). **Add runtime health analysis**: read `hook-health.jsonl` and check for:

1. **Exit code mismatch**: any entry where stdout > 0 but exit = 0 for Stop/PostToolUse runners (block written, TUI ignores it)
2. **Repeated crashes**: same runner has 3+ crash entries (exit != 0, stdout = 0) in recent window
3. **Stop hook never blocking**: auto-continue.js is installed but 0 Stop blocks in last N entries — runner is broken or module isn't loading
4. **Stale log**: hook-health.jsonl hasn't been written to in > 1 hour during business hours — hooks may not be firing at all
5. **Timeout kills**: runners getting SIGTERM (approaching 5s hook timeout)

When anomalies are detected, the watchdog:
- Writes `.watchdog-alert` flag (already read by project-health.js at next SessionStart)
- Logs to `watchdog-log.jsonl`
- Shows a Windows toast notification (new) so the user sees it immediately

### 4. Install watchdog scheduled task
The watchdog was never actually installed as a scheduled task. `watchdog.js --install` creates the task, but it was never run. Setup wizard should auto-install the watchdog. Verify it stays running.

## Log rotation
hook-health.jsonl added to `--prune` rotation (same as hook-log.jsonl).

## Scope
- `watchdog.js` — add `checkHealthLog()` function with 5 runtime checks
- `watchdog.js` — add Windows toast notification on failure
- `setup.js` — auto-install watchdog scheduled task during setup
- `scripts/test/test-watchdog-health.js` — test all 5 health log checks
- Verify scheduled task is running after install
