# hook-runner

Modular hook runner for Claude Code. Workflows group modules into enforceable pipelines.

## Repo
- **Account**: grobomo (public)
- **Marketplace**: trend-ai-taskforce/ai-skill-marketplace → plugins/hook-runner (PR #164 pending)
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
- `scripts/test/` — test scripts (85 suites, 1206 tests)
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
- `// requires: mod1, mod2` — missing deps = module skipped

## CLI Commands
```
node setup.js                # full setup wizard
node setup.js --yes          # non-interactive setup + default workflows
node setup.js --report       # HTML report
node setup.js --health       # verify runners + modules
node setup.js --sync         # sync modules from GitHub
node setup.js --list         # catalog vs installed
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

## Self-Reflection Architecture
- **Brain bridge (T331)**: `self-reflection.js` (Stop module) tries unified-brain `/ask` endpoint first (fast, has three-tier memory). Falls back to direct LLM call when brain is unavailable. `BRAIN_URL` env var configurable (default `http://localhost:8790`).
- **Scope rule**: self-reflection can self-repair hook-runner modules. For everything else, it only writes TODOs. reflection-gate.js enforces this — allows edits to `run-modules/` and `hook-runner/modules/`, blocks other production code when issues exist.
- **Scoring**: reflection-score.json persists across sessions, injected at SessionStart. Levels (Novice→Master) based on clean reflections, autonomy streaks, user corrections.

## Push Workflow
This is a grobomo repo. Before pushing:
1. `gh auth switch --user grobomo`
2. Push
3. Sync to marketplace:
   ```bash
   DEST=../ai-skill-marketplace/plugins/hook-runner
   # Core files
   cp setup.js report.js load-modules.js workflow.js workflow-cli.js hook-log.js run-async.js constants.js package.json CHANGELOG.md README.md CLAUDE.md "$DEST/"
   # Modules — use /* to copy contents INTO existing dir (not nested modules/modules/)
   for evt in PreToolUse PostToolUse SessionStart Stop UserPromptSubmit; do
     cp modules/$evt/*.js "$DEST/modules/$evt/" 2>/dev/null
   done
   # Workflows
   cp workflows/*.yml "$DEST/workflows/"
   ```
4. Switch back to default account
