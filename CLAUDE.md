# hook-runner

Modular hook runner for Claude Code. Workflows group modules into enforceable pipelines.

## Repo
- **Account**: grobomo (public)
- **Marketplace**: grobomo/claude-code-skills → plugins/hook-runner
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
- `modules/` — distributable module catalog organized by event type
- `workflows/` — built-in workflow definitions (YAML)
- `specs/` — feature specs with tasks and checkpoints
- `scripts/test/` — test scripts (40 suites, 532 tests)
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
- `// WORKFLOW: name` — only runs when that workflow is active
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
node setup.js --version      # show version
node setup.js --help         # show all commands
```

## Hook Design Rules
- **PreToolUse** = behavioral enforcement (blocking). Gates that prevent bad actions.
- **PostToolUse** = monitoring/reporting (non-blocking). Checks that warn or log.
- **Runners** must use `exit(1)` for blocks (not `exit(0)`) so the TUI shows the block.
- **Runners** must write block messages to `stderr` for TUI visibility.
- **Modules** must have `// WORKFLOW: name` tag and `// WHY:` comment.
- The `hook-editing-gate` module enforces these rules at edit time.

## Push Workflow
This is a grobomo repo. Before pushing:
1. `gh auth switch --user grobomo`
2. Push
3. Sync to marketplace: `cp setup.js report.js load-modules.js workflow.js workflow-cli.js ../claude-code-skills/plugins/hook-runner/`
4. Switch back to default account
