# Watchdog Vision

## The Problem

Hook-runner has a blind spot: it cannot inspect itself. When the stop hook fires, it makes a decision (DONE, CONTINUE, NEXT). But nothing validates whether that decision was **correct**. The stop hook can:

1. Fail to read the user's prompt ("not available") and default to DONE
2. Return DONE despite unchecked TODO items
3. Crash silently and produce no output
4. Make a decision that contradicts its own rules

In all these cases, Opus receives either no feedback or wrong feedback. The session ends prematurely or continues aimlessly. Nobody notices until the user sees the result.

## The Vision

A **separate hook** that fires AFTER the main stop hook. It inspects the stop hook's output and validates it was correct. It's the immune system — it doesn't do the work, it checks that the work was done properly.

This is not another stop rule. Stop rules run INSIDE the stop hook and are subject to its failures. The watchdog runs OUTSIDE and catches failures the stop hook can't catch about itself.

## What It Checks

### 1. Decision Quality (the critical gap today)
- Did the stop hook have the user's prompt? If "not available", the decision is uninformed — flag it.
- Did Haiku return DONE when TODO.md has unchecked items? That's a known failure mode.
- Did the decision match the stop rules? If `todo-awareness` says NEXT but final decision is DONE, something overrode it.
- Did the stop hook even produce output? Silence = crash.

### 2. Structural Health (exists today, works)
- Runner scripts exist with valid `require()` paths
- `load-modules.js` exists
- `hook-log.jsonl` updated recently
- No error/crash entries in recent log

### 3. Self-Healing (exists today, partially works)
- L1 (Haiku) classifies issues as fixable vs needs-human
- L2 (Sonnet) generates repair commands for fixable issues
- Auto-executes low-risk repairs

## What It Does When Something Is Wrong

1. **Writes to stderr** — Opus sees the warning immediately in the stop hook feedback
2. **Logs to watchdog-log.jsonl** — audit trail
3. **Writes to TODO.md** — so the issue is tracked and addressed next session
4. **Overrides DONE** — if the stop hook said DONE but the watchdog disagrees, it emits a CONTINUE mandate

## Architecture

```
User stops typing
  → Claude's response completes
    → Stop hook fires (run-stop.js → auto-continue-gate → Haiku rules → decision)
      → Watchdog fires (hook-runner-watchdog.js Stop)
        → Reads stop hook output from hook-log.jsonl
        → Validates decision quality
        → Emits correction if needed
```

The watchdog is a **second hook entry** in settings.json's Stop array. Claude Code fires them sequentially — watchdog always runs after the main stop hook.

## Key Principle: The Watchdog Never Makes Decisions

The watchdog doesn't decide whether Claude should stop or continue. That's the stop hook's job. The watchdog only checks whether the stop hook **did its job properly**. If it didn't (prompt unavailable, rule conflict, crash), the watchdog flags it and lets Opus decide what to do with the information.

## Current State

The watchdog exists (`hook-runner-watchdog.js`) but:
- **Disabled** — no `.watchdog-enabled` flag file
- **Not installed** — not in settings.json Stop hooks
- **Missing decision quality checks** — only checks structural health, not whether DONE/CONTINUE was correct
- **No stop-output inspection** — doesn't read the stop hook's actual decision from hook-log.jsonl

## Success Criteria

1. Watchdog is always enabled (no toggle — if it exists, it runs)
2. When the stop hook says "prompt unavailable", watchdog emits: "Stop hook made decision without user context. Treat as unreliable."
3. When DONE contradicts TODO.md state, watchdog emits: "DONE but N unchecked items remain."
4. When stop hook crashes (no output), watchdog emits: "Stop hook produced no output. Check run-stop.js."
5. All watchdog findings appear in stderr so Opus sees them
6. Watchdog never takes longer than 2s (no LLM calls in the hot path — save those for `heal` CLI)
