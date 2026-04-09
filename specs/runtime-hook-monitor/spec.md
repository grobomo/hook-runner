# Runtime Hook Health Monitor

## Problem
When a hook silently fails (runner crashes, wrong path, exit code bug, timeout), nobody knows until a user notices broken behavior. The T385 exit(0) bug went undetected across multiple sessions — the stop hook appeared to work but the TUI silently discarded its output.

Existing diagnostics (project-health.js, hook-self-test.js) only run at SessionStart. They check static properties (files exist, source code patterns). They don't observe runtime behavior: did the hook actually fire? Did it produce the expected result?

## Solution
Two components that work together:

### 1. run-hidden.js invocation log
Every hook invocation already goes through run-hidden.js (T387). Add logging: after the child process exits, write one JSONL line to `~/.claude/hooks/hook-health.jsonl`:

```json
{"ts":"2026-04-09T15:30:00Z","runner":"run-pretooluse.js","exit":1,"stdout":142,"stderr":0,"ms":45,"signal":null}
```

Fields:
- `ts` — ISO timestamp
- `runner` — which runner was called
- `exit` — child exit code
- `stdout` — bytes written to stdout (block JSON size)
- `stderr` — bytes written to stderr
- `ms` — wall clock time
- `signal` — if child was killed (SIGTERM, SIGKILL, etc.)

### 2. PostToolUse hook-health-monitor.js
After each tool call, reads the health log and checks for anomalies:

1. **Crash detection**: runner exited non-zero without writing block JSON to stdout. A legitimate block writes JSON + exits 1. A crash exits non-zero with no/invalid JSON.
2. **Exit code mismatch**: stdout has valid `{"decision":"block",...}` JSON but exit code is 0. This is the T385 bug pattern.
3. **Missing hooks**: reads settings.json to know which events have hooks configured. If the last N tool calls had no health log entries for a configured event, that hook isn't firing.
4. **Timeout/signal**: runner was killed (signal != null) or took >4900ms (close to 5s hook timeout).
5. **Repeated crashes**: same runner crashed 3+ times in last 10 entries — persistent problem.

The monitor is PostToolUse (non-blocking). It warns via stderr, never blocks.

## Log rotation
hook-health.jsonl is append-only. The `--prune` command already handles hook-log.jsonl rotation. Add hook-health.jsonl to the same rotation (prune entries older than N days).

## Scope
- `run-hidden.js` — add invocation logging
- `modules/PostToolUse/hook-health-monitor.js` — anomaly detection
- `scripts/test/test-hook-health-monitor.js` — test all 5 failure modes
- `setup.js` — add hook-health.jsonl to prune rotation
