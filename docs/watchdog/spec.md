# Watchdog Spec

## T826: Stop Hook Decision Validator

### Overview
Extend `hook-runner-watchdog.js` to validate stop hook decisions, not just structural health. The watchdog fires as a second Stop hook entry AFTER the main stop hook, reads the stop hook's output from hook-log.jsonl, and flags bad decisions.

### Changes Required

#### 1. Remove the toggle — watchdog is always-on
- Delete `isEnabled()` check from `runAsHook()`
- Remove `.watchdog-enabled` flag file mechanism
- If the watchdog is in settings.json, it runs. Period.
- The `on`/`off` CLI commands become no-ops with a message: "Watchdog is always-on. Remove from settings.json to disable."

#### 2. Add decision quality checks to `runAsHook("Stop")`

```
function checkStopDecision() {
  // Read last stop hook entry from hook-log.jsonl
  // Look for: event=Stop, module=auto-continue-gate (or stop-analysis-gate)
  // Extract: decision, user_prompt, rules_checked

  var issues = [];

  // Check 1: User prompt available?
  if (entry.user_prompt === "(not available)" || !entry.user_prompt) {
    issues.push("Stop hook decided without user prompt — decision is uninformed");
  }

  // Check 2: DONE with unchecked TODOs?
  if (decision === "DONE") {
    var todoPath = path.join(projectDir, "TODO.md");
    var unchecked = countUnchecked(todoPath);
    if (unchecked > 0) {
      issues.push("DONE but " + unchecked + " unchecked items in TODO.md");
    }
  }

  // Check 3: Decision conflicts?
  // Read decision-conflict entries from hook-log.jsonl
  if (hasConflict) {
    issues.push("Stop rules disagreed: " + conflictDetails);
  }

  // Check 4: Stop hook produced output?
  if (noStopEntries) {
    issues.push("Stop hook produced no log entries — may have crashed");
  }

  return issues;
}
```

#### 3. Emit findings to stderr
When issues found, write to stderr so Opus sees them in the stop hook feedback:
```
WATCHDOG: Stop hook decision may be unreliable (2 issues):
  - Stop hook decided without user prompt — decision is uninformed
  - DONE but 5 unchecked items in TODO.md
Override: Treat stop decision as CONTINUE until issues are resolved.
```

#### 4. Ensure watchdog is installed in settings.json
Add a SessionStart check: if watchdog exists in hooks dir but NOT in settings.json Stop array, auto-install it.

### Performance Budget
- No LLM calls in the hot path (those are for `heal` CLI only)
- Target: <500ms total for all checks
- Read hook-log.jsonl tail (last 2KB), count unchecked in TODO.md, check for conflicts

### Test Plan
1. Stop hook with "(not available)" prompt → watchdog flags it
2. DONE decision with unchecked TODOs → watchdog flags it
3. No stop hook output → watchdog detects crash
4. Clean decision (prompt available, no conflicts, no unchecked) → watchdog silent
5. Watchdog runs in <500ms
6. Watchdog stderr output visible to Opus

### Files Modified
- `hook-runner-watchdog.js` — add `checkStopDecision()`, remove toggle
- `modules/SessionStart/watchdog-install-check.js` — new module, ensures watchdog is in settings.json

### Dependencies
- None — watchdog reads hook-log.jsonl which is already written by the stop hook

### T827: Watchdog modification gate
Any edit to `hook-runner-watchdog.js` must be logged to an audit trail and requires a decision log entry explaining WHY the change was made. The watchdog is the last line of defense — changes to it must be deliberate and documented. Enforced by `hook-editing-gate.js` (add watchdog to protected paths).
