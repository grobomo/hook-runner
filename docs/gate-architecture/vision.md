# Gate Architecture — Vision

## Terminology

A **gate** is an enforcement point that runs at a hook event (PreToolUse, PostToolUse, UserPromptSubmit, Stop, SessionStart). Each gate can contain two types of rules:

- **Mechanical rules** (regex rules): Pattern matching, file lookups, deterministic checks. Fast (<1ms). For known patterns with clear right/wrong answers. Cannot handle nuance.
- **Haiku rules**: LLM judgment via L1 proxy. Slower (~1-3s). For unpredictable, nuanced situations requiring context. Also reviews mechanical rule decisions for false positives.

Both rule types operate inside gates. "Gate" means the entire enforcement system, not just mechanical blocks.

## Relationship Between Opus and Haiku

Haiku is an **advisor** — an angel on Opus's shoulder. It guides, suggests, and flags. Opus decides and acts.

- Haiku can say "this looks like a false positive" → Opus considers it
- Haiku can say "you should reflect before acting" → Opus weighs the suggestion
- Mechanical rules block hard → Opus cannot override (that's the point)
- When Haiku's guidance is wrong, Opus writes a correction to the rules YAML so Haiku learns

The feedback loop is bidirectional:
```
Haiku → guides Opus (l1-analysis.md, stop decisions)
Opus → corrects Haiku (updates userprompt-haiku-rules.yaml, stop-haiku-rules.yaml)
```

## When to Use Each Rule Type

| Question | Mechanical | Haiku |
|----------|-----------|-------|
| Can I reduce this to regex/file-exists? | Yes → mechanical | No → Haiku |
| Is the answer always the same for this pattern? | Yes → mechanical | No → Haiku |
| Does this need conversation context? | No → mechanical | Yes → Haiku |
| Is speed critical (fires 100x/session)? | Yes → mechanical | Avoid at PreToolUse |
| Am I checking a known correction? | Yes → read corrections.jsonl | No |
| Am I classifying ambiguous intent? | No | Yes → Haiku |

**Rule of thumb**: If you can write a regex for it, don't use Haiku. If you need judgment, don't use regex.

## Gate Events

Each hook event fires at a different moment. Rules go where the problem is first detectable:

| Event | When | Gate purpose |
|-------|------|-------------|
| **PreToolUse** | Before tool executes | BLOCK bad actions. All enforcement goes here. |
| **PostToolUse** | After tool executes | OBSERVE and LEARN. Self-review. Never blocks. |
| **UserPromptSubmit** | User sends message | CLASSIFY scope, inject corrections. Never blocks. |
| **Stop** | Claude finishes responding | CHECK session quality, force continue if needed. |
| **SessionStart** | Session begins | INITIALIZE context, read TODO, check health. |

### PreToolUse: Block

The only event that should hard-block tool calls. Both mechanical and Haiku rules can block here:

- Mechanical: "Is this `rm -rf`?" → block
- Mechanical: "Is this command in corrections.jsonl?" → block, suggest alternative
- Mechanical: "Does specs/ exist?" → block if missing and shtd enabled
- Haiku: "Is this a feature-level change without a vision doc?" → block (requires judgment)

### PostToolUse: Observe

Self-review and system improvement. Never blocks.

- Mechanical: Log what happened (timing, file changed, command output)
- Haiku: "Did this action align with the project vision?" → stderr warning if not
- Haiku: "Was a mechanical rule's block appropriate?" → flag false positives

### UserPromptSubmit: Classify

Interpret user intent, inject context. Never blocks (would lock user out).

- Haiku: Resolve shorthand, classify scope (one-off/task/feature/architecture)
- Haiku: Inject pending corrections from previous stops
- Mechanical: Log prompt, detect frustration patterns

### Stop: Review

Session-level quality check. Can force CONTINUE.

- Haiku: Should Claude stop or continue? Check TODO.md state.
- Haiku: Were there user corrections this turn? Set reflection flag.
- Mechanical: Self-healing — check for perf warnings, load failures

## Data Available to Gates

Gates access data through file reads, not API calls:

| Data | Path | Speed |
|------|------|-------|
| Tool input | stdin JSON | instant |
| Project dir | `$CLAUDE_PROJECT_DIR` | instant |
| TODO.md | `$CLAUDE_PROJECT_DIR/TODO.md` | <1ms |
| corrections.jsonl | `$CLAUDE_PROJECT_DIR/corrections.jsonl` | <1ms |
| scripts/MANIFEST.json | `$CLAUDE_PROJECT_DIR/scripts/MANIFEST.json` | <1ms |
| hook-log.jsonl | `~/.claude/hooks/hook-log.jsonl` | ~5ms |
| self-healing/index.json | `~/.claude/hooks/self-healing/index.json` | <1ms |
| Git branch | `.git/HEAD` | <1ms |
| Haiku rules YAML | `~/.claude/hooks/rules/*.yaml` | <1ms |
| Pending corrections | `~/.claude/hooks/.correction-pending-{session}.json` | <1ms |
| Pending requests | `~/.claude/hooks/.pending-requests-{session}.json` | <1ms |

## Workflows

Workflows group rules into enforceable pipelines. A gate only fires if its workflow is enabled.

| Workflow | Purpose | Extends |
|----------|---------|---------|
| `core` | Destructive guards, base safety. Default on. | — |
| `dev-discipline` | Spec-first enforcement, code quality. | core |
| `self-management` | Haiku self-correction, stop rules, auto-continue. | core |
| `gsd` | GSD phase-based development. | core |
| `fleet` | Cross-project dispatch, session lifecycle. | core |
| `customer-guard` | Read-only customer environments. | core |
| `no-docker` | Block local Docker. | core |

## Anti-Patterns

1. **Haiku for known facts**: If a script exists or doesn't, read the file. Don't ask Haiku.
2. **Blocking in PostToolUse**: Too late. If it needed blocking, it should be PreToolUse.
3. **Gate goes dormant when prerequisite is missing**: The prerequisite being missing IS the block condition. Never exempt.
4. **Corrections in logs only**: If it's not in TODO.md, it gets ignored. Serialize to disk.
5. **Immediate action after correction**: Reflect first, then act. Correction → analysis → prevention → action.
