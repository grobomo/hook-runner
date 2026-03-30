# hook-runner

Modular hook runner system for Claude Code. One runner per event, modules in folders.

## Repo
- **Account**: grobomo (public)
- **Marketplace**: grobomo/claude-code-skills → plugins/hook-runner
- **Local skill**: ~/.claude/skills/hook-runner/
- **Live hooks**: ~/.claude/hooks/ (run-*.js, load-modules.js, run-modules/)

## File Layout
- `setup.js` — CLI entry point (setup wizard, report, health, sync, stats, prune, version)
- `run-*.js` — event runners (one per event: pretooluse, posttooluse, stop, sessionstart, userpromptsubmit)
- `load-modules.js` — shared module loader (global + project-scoped discovery)
- `hook-log.js` — centralized logger (appends JSONL per invocation)
- `run-async.js` — async module executor (Promise detection, 4s timeout)
- `modules/` — distributable module catalog organized by event type
- `scripts/test/` — test scripts (79 tests across 5 files)

## Sync Targets (must stay identical)
1. Repo: this directory
2. Live: ~/.claude/hooks/
3. Skill: ~/.claude/skills/hook-runner/
4. Marketplace: ../claude-code-skills/plugins/hook-runner/

After any code change, copy to all 4 locations. The sync command in setup.js handles modules; runners must be copied manually.

## Testing
```bash
bash scripts/test/test-runners.sh      # 16 runner tests
bash scripts/test/test-setup-wizard.sh # 6 wizard tests
bash scripts/test/test-async.sh        # 13 async tests
bash scripts/test/test-modules.sh      # 32 module validation tests
bash scripts/test/test-module-sync.sh  # 10 sync tests
```

## Module Contract
- Sync: `module.exports = function(input) { return null; }` — preferred for gates
- Async: `module.exports = async function(input) { ... }` — 4s timeout per module
- Return `null` to pass, `{decision: "block", reason: "..."}` to block
- First block wins, remaining modules skipped

## CLI Commands
```
node setup.js               # full setup wizard
node setup.js --report      # HTML report
node setup.js --dry-run     # preview changes
node setup.js --health      # verify runners + modules
node setup.js --sync        # sync modules from GitHub
node setup.js --stats       # text summary of hook log
node setup.js --list        # show catalog vs installed modules
node setup.js --prune [N]   # prune log entries older than N days (default 7)
node setup.js --version     # show version
```

## Push Workflow
This is a grobomo repo. Before pushing:
1. `gh auth switch --user grobomo`
2. Push
3. Sync to marketplace: `cp setup.js SKILL.md ../claude-code-skills/plugins/hook-runner/`
4. `gh auth switch --user joel-ginsberg_tmemu`
