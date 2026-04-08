# Hypothesis Enforcement Hooks

## Problem

In the DDEI email security project, Claude ran 289 az vm run-commands, 182 poll loops,
and tried 8 different approaches to the same problem over 51 sessions in 2 days — all
without tracking or reflecting on failures. The root causes:

1. **No throttle on infra commands** — once allowed, unlimited commands with no check
2. **No failure tracking** — same broken approach retried dozens of times
3. **Manual rules don't work** — Claude writes "I'll do it right next time" in CLAUDE.md
   then forgets next session. Rules in prose are suggestions, not enforcement.

## Solution: Two hooks

### Hook 1: `hypothesis-throttle` (PreToolUse:Bash, project-scoped for ddei-email-security)

**State file:** `<project>/.claude/hypothesis-state.json`

```json
{
  "session_id": "abc123",
  "infra_commands": 4,
  "failures": 1,
  "last_hypothesis_mtime": 1712345678000
}
```

**What counts as infra:** `az vm|network|storage|group|role`, `ssh`, `scp`, `terraform`

**Logic:**
1. On every infra Bash command → increment `infra_commands`
2. New session (different CLAUDE_SESSION_ID) → reset counters
3. HYPOTHESIS.md modified (mtime changed) → reset failure counter only
4. `infra_commands > 8` AND no feature branch → BLOCK: "Create branch + PR to track"
5. `infra_commands > 8` AND on feature branch → every 5th command past threshold: BLOCK
   asking "are you spinning wheels?" until HYPOTHESIS.md is updated
6. `failures >= 2` → BLOCK: "Update HYPOTHESIS.md Failed Approaches before continuing"

**Failure counting:** Needs a PostToolUse companion hook that increments `failures`
when a Bash infra command exits non-zero.

### Hook 2: `no-prose-enforcement` (PreToolUse:Write/Edit, global)

**Problem:** Claude writes behavioral rules as prose in CLAUDE.md or .claude/rules/:
"Always do X before Y", "Never run Z without checking W". These are suggestions that
get ignored next session. The fix is always a hook, never prose.

**Logic:**
When writing/editing files matching `CLAUDE.md`, `.claude/rules/*.md`, or `TODO.md`:
1. Scan the new content for enforcement-like patterns:
   - "always [verb]", "never [verb]", "must [verb]", "do not [verb]"
   - "before doing X, check Y", "after X, verify Y"
   - "workflow:", "procedure:", "mandatory:"
2. If >2 enforcement-like sentences are being added → BLOCK:
   "You're writing manual enforcement rules. These don't survive context resets.
    Build a hook in the hook-runner project instead.
    Prose rules = suggestions. Hooks = enforcement."
3. ALLOW: factual documentation (architecture, API docs, credentials, IPs)
4. ALLOW: rules that describe what hooks do (documenting existing enforcement)

**Challenge:** Distinguishing documentation from enforcement. Heuristic:
- If the sentence has an imperative verb directed at Claude → enforcement → needs hook
- If the sentence describes a system or fact → documentation → allowed
- Use simple regex patterns, not LLM analysis (hooks must be fast)

### Hook 3: `hypothesis-failure-tracker` (PostToolUse:Bash, project-scoped)

Companion to hypothesis-throttle. After a Bash command completes:
1. Check if the command was an infra command (same regex as throttle)
2. If exit_code != 0 → increment `failures` in hypothesis-state.json
3. If exit_code == 0 → no action (don't reset failures — that requires HYPOTHESIS.md update)

## Thresholds

| Threshold | Value | Rationale |
|-----------|-------|-----------|
| infra_commands | 8 | Enough for a 6-step hypothesis test + 2 retries |
| failures | 2 | Two strikes = approach is broken, rethink |
| reminder_interval | 5 | Every 5 commands past threshold, re-prompt |

## Files to create

```
run-modules/PreToolUse/ddei-email-security/hypothesis-throttle.js
run-modules/PreToolUse/no-prose-enforcement.js
run-modules/PostToolUse/ddei-email-security/hypothesis-failure-tracker.js
```

## Test plan

1. **hypothesis-throttle**: Mock 9 infra commands, verify block on 9th
2. **hypothesis-throttle**: Verify session reset clears counters
3. **hypothesis-throttle**: Touch HYPOTHESIS.md, verify failure counter resets
4. **hypothesis-throttle**: Verify non-infra commands (git, ls) don't count
5. **no-prose-enforcement**: Write "always verify RDP before deploying" to rules/ → blocked
6. **no-prose-enforcement**: Write "Jumpbox IP: 10.0.0.1" to CLAUDE.md → allowed
7. **hypothesis-failure-tracker**: Simulate failed az command, verify failures incremented
