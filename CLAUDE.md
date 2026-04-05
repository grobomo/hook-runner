# hook-runner

Modular hook runner system for Claude Code. One runner per event, modules in folders.

## Repo
- **Account**: grobomo (public)
- **Marketplace**: grobomo/claude-code-skills → plugins/hook-runner
- **Local skill**: ~/.claude/skills/hook-runner/
- **Live hooks**: ~/.claude/hooks/ (run-*.js, load-modules.js, run-modules/)

## File Layout
- `setup.js` — CLI entry point with extracted command handlers
- `report.js` — HTML report generator
- `workflow.js` — zero-dep YAML workflow engine (state machine, gate validation)
- `load-modules.js` — shared module loader (global + project-scoped + workflow filtering + dependency validation)
- `hook-log.js` — centralized logger (JSONL per invocation, per-module timing)
- `run-async.js` — async module executor (Promise detection, 4s timeout)
- `run-*.js` — event runners (pretooluse, posttooluse, stop, sessionstart, userpromptsubmit)
- `modules/` — distributable module catalog organized by event type
- `workflows/` — built-in workflow definitions (YAML)
- `package.json` — npm package metadata (enables `npx grobomo/hook-runner`)
- `scripts/test/` — test scripts (233 tests across 20 suites)

## Sync Targets (must stay identical)
1. Repo: this directory
2. Live: ~/.claude/hooks/
3. Skill: ~/.claude/skills/hook-runner/
4. Marketplace: ../claude-code-skills/plugins/hook-runner/

## Testing
```bash
node setup.js --test    # runs all 20 suites (233 tests)
```

## Module Contract
- Sync: `module.exports = function(input) { return null; }` — preferred for gates
- Async: `module.exports = async function(input) { ... }` — 4s timeout per module
- Return `null` to pass, `{decision: "block", reason: "..."}` to block
- Dependencies: `// requires: mod1, mod2` in first 5 lines — missing deps = skipped
- Workflow tag: `// WORKFLOW: name` in first 5 lines — only runs when that workflow is active

## CLI Commands
```
node setup.js               # full setup wizard
node setup.js --report      # HTML report
node setup.js --health      # verify runners + modules
node setup.js --sync        # sync modules from GitHub
node setup.js --list        # catalog vs installed
node setup.js --stats       # text summary of hook log
node setup.js --perf        # module timing analysis
node setup.js --export      # export module config as YAML
node setup.js --workflow     # list|audit|query|enable|disable|start|status|complete|reset
node setup.js --test        # run all test suites
node setup.js --upgrade     # fetch latest from GitHub
node setup.js --uninstall   # remove hook-runner
node setup.js --prune [N]   # prune log entries older than N days
node setup.js --version     # show version
node setup.js --help        # show all commands
```

## Push Workflow
This is a grobomo repo. Before pushing:
1. `gh auth switch --user grobomo`
2. Push
3. Sync to marketplace: `cp setup.js report.js load-modules.js workflow.js ../claude-code-skills/plugins/hook-runner/`
4. `gh auth switch --user joel-ginsberg_tmemu`
