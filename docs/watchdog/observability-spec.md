# Observability System Spec

## Problem

Things break silently. Stop hooks fire but output is invisible. Gates get disabled and nobody notices. The token proxy goes down and Haiku gates fail-open. Modules crash and get skipped. The user finds out hours later when something obviously wrong happens.

There is no single place that monitors whether the entire enforcement infrastructure is working as intended.

## Solution: SessionStart Health Report

One module. Fires at session start. Checks everything. Writes a single report to stderr so Opus sees it immediately. No Haiku, no LLM calls — pure mechanical checks.

### What It Checks

| Check | How | Fail means |
|-------|-----|-----------|
| Stop hook visible | Last Stop entry in hook-log.jsonl has stdout output | Stop hook output not reaching TUI |
| Stop hook firing | hook-log.jsonl has Stop entries from last session | run-stop.js broken or not in settings.json |
| Watchdog firing | watchdog-log.jsonl has entries from last session | Watchdog not installed or crashing |
| Token proxy up | HTTP GET http://127.0.0.1:4100/health | Haiku gates all fail-open |
| Module count | Count .js files in run-modules/{Event}/ | Modules deleted or dir missing |
| Workflow config | Read workflow-config.json, count enabled | All workflows disabled = most gates dead |
| Settings.json hooks | Parse settings.json, verify Stop/PreToolUse/PostToolUse entries exist | Hook entries removed |
| Recent errors | Scan hook-log.jsonl tail for result=error entries | Modules crashing silently |
| Correction backlog | Check correction-log.jsonl for unaddressed corrections | User corrections being ignored |
| Reflection pending | Check .reflection-pending.json | Correction acknowledged but not reflected |

### Output Format

```
[HEALTH] 10/10 checks passed
```

or

```
[HEALTH] 7/10 checks passed, 3 ISSUES:
  - Stop hook output not visible in TUI (last Stop had no stdout)
  - Token proxy unreachable (Haiku gates fail-open)
  - 3 module errors in last session (spirit-check, rca-write-check, auto-continue-gate)
```

### Implementation

Single file: `modules/SessionStart/health-report-check.js`
- Tagged `// WORKFLOW: haiku-rules` (always active)
- Non-blocking (returns null, output to stderr)
- Runs in <200ms (all file reads, one HTTP check with 1s timeout)
- Logs results to hook-log.jsonl

## T831: Build It

- [ ] T831: **SessionStart health report** — Single module that checks 10 infrastructure health indicators at session start. Pure mechanical (no LLM). Outputs pass/fail summary to stderr. Catches: invisible stop hooks, dead proxy, disabled workflows, crashing modules, unaddressed corrections. <200ms budget.
