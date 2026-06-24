# hook-runner

Modular hook runner for Claude Code. Workflows group modules into enforceable pipelines.

## Repo
- **Account**: grobomo (public)
- **Team mirror**: trend-aatf-external/hook-runner (private, push via tmemu account, remote `aatf`)
- **Local skill**: ~/.claude/skills/hook-runner/
- **Live hooks**: ~/.claude/hooks/ (run-*.js, load-modules.js, run-modules/)

## File Layout
- `setup.js` — CLI entry point with command handlers
- `report.js` — HTML report generator
- `workflow.js` — YAML workflow engine (state machine, gate validation)
- `workflow-cli.js` — workflow CLI subcommands (list, audit, query, create, etc.)
- `load-modules.js` — module loader (global + project-scoped + workflow filtering + dependency validation)
- `hook-log.js` — centralized logger (JSONL per invocation, per-module timing)
- `run-async.js` — async module executor (Promise detection, 4s timeout)
- `run-*.js` — event runners (pretooluse, posttooluse, stop, sessionstart, userpromptsubmit)
- `snapshot.js` — ecosystem snapshot, drift detection, and portable backup/restore
- `modules/` — distributable module catalog organized by event type
- `workflows/` — built-in workflow definitions (YAML)
- `specs/` — feature specs with tasks and checkpoints
- `demo.js` — interactive demo (simulates module gates against realistic scenarios)
- `scripts/test/` — test scripts (158 suites, ~2340 tests)
- `package.json` — npm package (enables `npx grobomo/hook-runner`)

## Testing
```bash
node setup.js --test    # runs all suites, auto-discovers scripts/test/test-*.sh
```

## Module Contract
- Sync: `module.exports = function(input) { return null; }` — preferred for gates
- Async: `module.exports = async function(input) { ... }` — 4s timeout
- Return `null` to pass, `{decision: "block", reason: "..."}` to block
- `// WHY:` comment required — explains the real incident that caused the module
- `// WORKFLOW: name` — only runs when that workflow is active (comma-separated for multi: `// WORKFLOW: shtd, starter`)
- `// BLOCKING: true` — Stop modules only: run synchronously so block/pass is visible in TUI. Without this, Stop modules run in a detached background worker.
- `// requires: mod1, mod2` — missing deps = module skipped
- All tags are parsed in a single pass by `parseModuleMeta()` in `load-modules.js`. To add a new tag, add it there.

## CLI Commands
```
node setup.js                # full setup wizard
node setup.js --yes          # non-interactive setup + default workflows
node setup.js --report       # HTML report
node setup.js --health       # verify runners + modules
node setup.js --diagnose     # diagnose settings, hooks, broken scripts (--fix, --json)
node setup.js --sync         # sync modules from GitHub
node setup.js --list         # catalog vs installed
node setup.js --search <q>   # find modules by name or WHY description
node setup.js --stats        # text summary of hook log
node setup.js --perf         # module timing analysis
node setup.js --export       # export module config as YAML
node setup.js --workflow     # list|audit|query|enable|disable|start|status|complete|reset|create|add-module|sync-live
node setup.js --test         # run all test suites
node setup.js --upgrade      # fetch latest from GitHub
node setup.js --uninstall    # remove hook-runner (--confirm restores backup)
node setup.js --prune [N]    # prune log entries older than N days
node setup.js --snapshot     # SHA256 snapshot of current state
node setup.js --snapshot drift  # detect drift from last snapshot
node setup.js --snapshot backup # copy to git repo, commit, push
node setup.js --snapshot restore # clone repo, restore files
node setup.js --demo         # interactive demo (--fast to skip animation)
node setup.js --demo-html    # generate standalone HTML demo page
node setup.js --version      # show version
node setup.js --help         # show all commands
```

## Hook Design Rules
- **PreToolUse** = behavioral enforcement (blocking). Gates that prevent bad actions.
- **PostToolUse** = monitoring/reporting (non-blocking). Checks that warn or log.
- **UserPromptSubmit** = **ZERO modules allowed.** Any bug in a UPS module locks the user out of their session entirely — they cannot send any message to fix it. All UPS functionality (logging, flagging, detection) must live in PreToolUse, PostToolUse, or Stop. The `hook-editing-gate` enforces this.
- **Runners** must use `exit(1)` for blocks (not `exit(0)`) so the TUI shows the block.
- **Runners** must write block messages to `stderr` for TUI visibility.
- **Modules** must have `// WORKFLOW: name` tag and `// WHY:` comment.
- **Modules** may have `// TOOLS: Bash, Edit, Write` tag — skips loading when tool doesn't match (saves ~5ms/module).
- The `hook-editing-gate` module enforces these rules at edit time (including the UPS no-block rule).

## Enforcement Philosophy: Gates > Rules > Memory

**Three enforcement tiers exist. Use the strongest one that fits.**

### Tier 1: Mechanical Gates (STRONGEST — use by default)
PreToolUse/PostToolUse modules that mechanically block or detect. Code runs, regex matches, file checks happen. Claude CANNOT rationalize past a gate — it either passes or blocks. Every behavioral requirement should be a gate unless there's a reason it can't be.

Examples: `hook-editing-gate.js` (blocks edits), `force-push-gate.js` (blocks force push), `no-rules-gate.js` (blocks .claude/rules/ writes).

### Tier 2: Haiku Stop Rules (MEDIUM — for judgment calls)
Rules in `stop-haiku-rules.yaml` that Haiku evaluates at every stop. Good for decisions that need context (is this task done? should Claude keep going?). Haiku rules SHOULD reference mechanical gate results when available — e.g., "if the test gate blocked, tell Claude to fix the tests" rather than reimplementing the test check in the rule.

Examples: `todo-awareness` (checks TODO.md for unchecked items), `never-ask-permission` (detects "Want me to...?" patterns).

### Tier 3: Claude Native Rules/Memory (WEAKEST — never rely on these)
`.claude/rules/` files, MEMORY.md, or Claude's built-in memory system. These are **suggestions Claude can ignore or forget**. They don't survive context resets reliably. NEVER use these for behavioral enforcement. The `no-rules-gate` mechanically blocks `.claude/rules/` file creation.

### Decision Hierarchy
1. Can it be checked mechanically (regex, file existence, exit code)? → **Gate**
2. Does it need LLM judgment (context, intent, completion status)? → **Haiku rule** (referencing gate outputs)
3. Is it just a preference with no enforcement need? → **CLAUDE.md documentation** (this file)

### Decision Logging
Every behavioral change (exit codes, gate logic, stop rules) MUST be documented with WHY. Gate `T777` (when built) enforces this by requiring a `decisions.jsonl` entry for hook infrastructure edits. Without a decision log, changes made in one session become mysterious bugs in the next.

## Gate System Philosophy

Gates are Claude's memory between sessions. Promises don't survive context resets — gates do. The system exists to help Claude work better, not to fight against.

**How it works for other sessions:**
1. Claude (in any project) attempts a tool call
2. PreToolUse gates evaluate the call against rules
3. If blocked, the block message tells Claude WHY and WHAT TO DO
4. If the gate is wrong (false positive), Claude files a TODO HERE (hook-runner) with the fix
5. Claude checks if a hook-runner session is running (via fleet API)
6. If not running, Claude spawns one (via context-reset/new_session.py)
7. Hook-runner session picks up the TODO and fixes the gate
8. Meanwhile, Claude works around the false positive while respecting the gate's SPIRIT

**Critical: hook-runner is the ONLY project that can edit gates.** The `hook-editing-gate` enforces this. Other sessions file TODOs here — they never touch gate code directly.

## Block Message Standard (MANDATORY)

Every block message MUST include three parts:

```
BLOCKED: {what was blocked — the specific action}
WHY: {what incident or failure this prevents — one sentence explaining the real reason}
NEXT STEPS:
1. {first action to take}
2. {second action if needed}
FALSE POSITIVE? File a TODO in hook-runner: "Fix {gate-name} — {what went wrong}"
```

The FALSE POSITIVE line ensures Claude always knows how to handle incorrect blocks instead of getting stuck or using a different tool to sneak past the gate's intent.

**Example (good):**
```
BLOCKED: git push --force to main
WHY: Force push destroyed the entire gate system on 2026-05-20 — 142 modules lost, 3 hours to recover.
NEXT STEPS:
1. Use 'git push' without --force
2. If you need to rewrite history, create a new branch and PR instead
FALSE POSITIVE? File a TODO in hook-runner: "Fix force-push-gate — {describe the legitimate use case}"
```

**Example (bad):**
```
BLOCKED: Force push not allowed.
```
(No WHY, no next steps — Claude doesn't understand the spirit and will try to work around it)

**Why this matters:** When Claude hits a block, it needs to understand the SPIRIT (to respect it) and the PATH FORWARD (to keep working). Without both, it either fights the gate or stops dead. 66 gates currently lack NEXT STEPS — fixing this is the top priority.

## Haiku Preprocessor Architecture

LLM-powered gate decisions using Haiku via the `llm-token-tracker` proxy at `:4100`.

### Components

| Component | Path | Purpose |
|-----------|------|---------|
| `_haiku-judge.js` | `modules/PreToolUse/` | Shared helper for structured `/judge` calls (returns `{allow, reason, confidence}`) |
| `haiku-client.js` | `~/.claude/hooks/` | Shared helper for freeform `/v1/chat/completions` calls (returns `{ok, content, parsed}`) |
| Rules files | `~/.claude/proxy/` | YAML/MD config files read by modules at runtime |
| LLM proxy | `llm-token-tracker` `:4100` | Routes to Anthropic/RDSec, logs token usage, `/judge` + `/ask` + `/health` |

### Auth
Both helpers read `ANTHROPIC_AUTH_TOKEN` from env (set in `settings.json`). The proxy requires `Authorization: Bearer <token>` on all endpoints.

### haiku-client.js API
```js
var haiku = require(path.join(HOME, ".claude", "hooks", "haiku-client"));

// Freeform LLM call
var result = haiku.call({
  prompt: "Analyze this...",
  caller: "my-gate",        // logged for attribution
  jsonMode: true,            // parse JSON from response
  maxTokens: 300,
  timeoutMs: 8000
});
// result: { ok: true, content: "...", parsed: {...}, ms: 1234 }

// Read recent conversation from transcript JSONL
var ctx = haiku.getConversationContext(transcriptPath, 8);
```

### WSL vs Windows
- **Windows**: `haiku-client.js` uses Node `http` module via `child_process.execSync` (synchronous). Proxy at `:4100` (`llm-token-tracker`).
- **WSL**: `haiku-client.js` uses `curl` to `:4100`. Same proxy endpoint, different transport.
- Modules are identical across platforms — only `haiku-client.js` differs.

### Modules that depend on haiku
| Module | Event | Dependency |
|--------|-------|------------|
| `agent-quality-gate.js` | PreToolUse | `haiku-client.js` |
| `pre-tool-verify-gate.js` | PreToolUse | `haiku-client.js` |
| `post-tool-use-gate.js` | PostToolUse | `haiku-client.js` |
| `auto-continue-gate.js` | Stop | `haiku-client.js` + `stop-haiku-rules.yaml` |
| `stop-analysis-gate.js` | Stop | `haiku-client.js` + `stop-haiku-rules.yaml` |

### Rules files
| File | Used by | Purpose |
|------|---------|---------|
| `stop-haiku-rules.yaml` | `auto-continue-gate.js`, `stop-analysis-gate.js` | Stop-event decision rules (DONE/CONTINUE/NEXT/DISPATCH) |
| `sessionstart-haiku-rules.md` | `load-instructions-gate.js` | Text injected at session start |
| `userprompt-haiku-rules.yaml` | L1 preprocessor (future) | Shorthand resolution, interpretation rules |

### `haiku-rules` Workflow
Lightweight direct-to-main workflow with 13 modules. Enabled via `workflow-config.json`. No branch/PR enforcement. Modules tagged `// WORKFLOW: haiku-rules`.

**PreToolUse (8):** agent-quality-gate, gate-quality-gate, no-rewrite-gate, pre-tool-verify-gate, proxy-restart-gate, settings-watchdog-gate, spec-gate, todo-gate

**PostToolUse (1):** post-tool-use-gate

**SessionStart (2):** load-instructions-gate, stop-hook-selftest-check

**Stop (2):** auto-continue-gate, stop-analysis-gate

## Hook Runner Watchdog (T750)

A **separate** hook from hook-runner that validates hook-runner fired correctly. Lives at `~/.claude/hooks/hook-runner-watchdog.js`. Has its own settings.json entry (fires AFTER hook-runner on Stop events).

### CLI Commands (all proven, tested)
```bash
node ~/.claude/hooks/hook-runner-watchdog.js status     # health check all runners
node ~/.claude/hooks/hook-runner-watchdog.js deploy      # backup → install → verify → auto-rollback
node ~/.claude/hooks/hook-runner-watchdog.js backup      # snapshot 9 hook files + module manifest
node ~/.claude/hooks/hook-runner-watchdog.js restore     # restore from last backup
node ~/.claude/hooks/hook-runner-watchdog.js monitor 30  # watch loop (30s), auto-rollback after 3 failures
node ~/.claude/hooks/hook-runner-watchdog.js on/off      # toggle (flag file or HOOK_WATCHDOG=1 env)
node ~/.claude/hooks/hook-runner-watchdog.js analyze     # categorize issues from log, generate TODOs
node ~/.claude/hooks/hook-runner-watchdog.js heal        # L1 classify + L2 diagnose + auto-repair (low-risk only)
node ~/.claude/hooks/hook-runner-watchdog.js heal --dry-run  # same but preview without executing
```

### What it checks
- Runner scripts exist with valid `require()` paths (catches T747-style crashes)
- `load-modules.js` exists
- `hook-log.jsonl` updated recently (runner actually fired)
- No error/crash entries in recent log
- Module count matches expectations

### When to use
- **After editing any hook file**: run `status` to verify nothing broke
- **After deploying changes**: run `deploy` (auto-backs up first, auto-rolls back on failure)
- **When stop hooks seem invisible**: run `analyze` to categorize issues and `heal` for auto-repair
- **Continuous monitoring**: run `monitor` in a separate terminal for ongoing health checks

### Logs
- `~/.claude/hooks/watchdog-log.jsonl` (separate from hook-log.jsonl)
- 41 tests in `scripts/test/test-T750-watchdog.js`

## Self-Reflection Architecture
- **Brain bridge (T331)**: `self-reflection.js` (Stop module) tries unified-brain `/ask` endpoint first (fast, has three-tier memory). Falls back to direct LLM call when brain is unavailable. `BRAIN_URL` env var configurable (default `http://localhost:8790`).
- **Scope rule**: self-reflection can self-repair hook-runner modules. For everything else, it only writes TODOs. reflection-gate.js enforces this — allows edits to `run-modules/` and `hook-runner/modules/`, blocks other production code when issues exist.
- **Scoring**: reflection-score.json persists across sessions, injected at SessionStart. Levels (Novice→Master) based on clean reflections, autonomy streaks, user corrections.

## Publishing Rules

### Team Sharing — REQUIRES USER PERMISSION
- **NEVER publish or sync to any shared marketplace without explicit user approval.**
- Claude has a history of sharing projects prematurely before they are functional. This damages credibility.
- The user must explicitly say "sync to marketplace" or "publish" before any marketplace operation.
- `publish.json` tracks whether the user has approved sharing. If `"team_sharing_approved": false` or the key is missing, DO NOT publish.

### Two Shared Marketplaces
Both are shared team spaces (not owned by grobomo). NEVER push to either without permission.

| Marketplace | Org | Purpose | Status |
|-------------|-----|---------|--------|
| `ai-skill-marketplace` | `trend-ai-taskforce` | Curated AI skills following Agent Skills Specification. Cross-platform (Claude, Copilot, Gemini). Formal plugin structure. | Known — local clone exists |
| `plugin-marketplace` | `aatf-external` | External-facing plugins. Simpler structure (manifest.json + SKILL.md). | TODO: Research exact org, audience, and approval process |

**Decision rule**: Do NOT autonomously determine which marketplace to use. Ask the user.

### Push Workflow
This is a grobomo repo. Before pushing to grobomo/hook-runner (the source repo):
1. Use `gh_auto` for all push/pull operations (never raw `gh` or `git push`)
2. Push to grobomo/hook-runner
3. Do NOT sync to marketplace unless user explicitly approves
4. The marketplace sync commands are documented here for reference only — run them ONLY when user says to:
   ```bash
   # ONLY when user approves marketplace sync:
   DEST=../ai-skill-marketplace/plugins/hook-runner
   cp setup.js report.js load-modules.js workflow.js workflow-cli.js hook-log.js run-async.js constants.js package.json CHANGELOG.md README.md CLAUDE.md "$DEST/"
   for evt in PreToolUse PostToolUse SessionStart Stop UserPromptSubmit; do
     cp modules/$evt/*.js "$DEST/modules/$evt/" 2>/dev/null
   done
   cp workflows/*.yml "$DEST/workflows/"
   ```
