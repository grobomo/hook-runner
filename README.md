# hook-runner

[![Tests](https://github.com/grobomo/hook-runner/actions/workflows/test.yml/badge.svg)](https://github.com/grobomo/hook-runner/actions/workflows/test.yml)

Modular hook system for Claude Code. Enforce workflows, block mistakes, inject context — all with plain `.js` files in folders. No settings.json editing needed.

## What is hook-runner?

Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) let you run scripts at key moments: before a tool runs, after it runs, when a session starts, when it stops. hook-runner turns this into a **module system** — drop a `.js` file in a folder and it runs automatically.

On top of modules, **workflows** group related modules into enforceable pipelines. Enable a workflow and its modules activate together. Disable it and they all go silent. This gives you a single place to organize all your hook behavior — no more hunting through `settings.json` entries.

## Why hook-runner?

Claude Code hooks are powerful but raw: you write shell commands in `settings.json`, they run on every invocation, and there's no structure. This works with three hooks. It doesn't work when you have 30+ enforcement rules, some that only apply in certain contexts, and you need to turn groups on and off.

hook-runner replaces direct `settings.json` editing. After install, you never touch `settings.json` for hooks again — hook-runner owns all five events and routes to your modules automatically.

**1. Modules over shell commands.** Each rule is a `.js` file that receives structured input (tool name, file path, command) and returns a decision. Modules are testable, documented, and version-controlled. Drop a file in a folder and it runs — remove it and it stops.

**2. Workflows over individual modules.** You don't think "I need to enable spec-gate, branch-gate, test-checkpoint-gate, and worker-loop." You think "I want the SHTD development pipeline." Workflows group related modules so you enable one name and get a complete enforcement regime. Disable it and they all go silent. This is how you manage 80+ modules without losing track.

**3. Portability.** Export your module config as YAML (`--export`), sync it to another machine (`--sync`), or share a workflow definition. Workflows also make it easy to switch contexts — enable `customer-data-guard` during incident response, disable it after.

## Integrating with other Claude Code tools

hook-runner is one piece of a larger Claude Code tooling ecosystem. Here's how the pieces connect:

- **context-reset** — When a session's context gets long, `context-reset` saves conversation state to `SESSION_STATE.md` and starts fresh. hook-runner's `SessionStart` modules inject active workflow status on the new session so Claude picks up where it left off without losing enforcement context.

- **skill-maker** — Skills are reusable prompts; hooks are enforcement. A skill tells Claude *how* to do something, a hook tells it *what it must not do*. Use skill-maker to create workflows that call hook-runner's CLI (`--workflow start`, `--health`, `--report`).

- **mcp-manager** — MCP servers provide Claude with tools (browser automation, API access). hook-runner gates *which* tools Claude can use and *how*. For example, a PreToolUse module can block `Bash` commands that hit production endpoints, while mcp-manager provides the staging endpoint via an MCP tool.

- **claude-code-skills marketplace** — hook-runner is published to `grobomo/claude-code-skills`. Install the skill to get `--workflow`, `--report`, and the full module catalog. The marketplace copy stays in sync with this repo.

- **OpenClaw** — hook-runner gates are portable to [OpenClaw](https://openclaw.ai) via the Plugin SDK. The `openclaw-plugin/` directory contains a ready-to-install plugin with 3 ported gates (force-push, secret-scan, commit-quality). Install with `bash openclaw-plugin/install.sh`. See [openclaw-plugin/README.md](openclaw-plugin/README.md) for the conversion table.

## Quick Start

```bash
# One-liner install (enables default workflows)
npx grobomo/hook-runner --yes

# Or step by step
git clone https://github.com/grobomo/hook-runner.git
cd hook-runner && node setup.js
```

The setup wizard will:
1. Scan your current hooks and generate a styled HTML report
2. Back up existing hooks to `~/.claude/hooks/archive/`
3. Install the runner system
4. Enable the `starter` workflow (with `--yes`) — 42 universally useful modules

Ready for more? Enable the full development pipeline:
```bash
node setup.js --workflow enable shtd    # 101 modules: spec-first, test-first, PR discipline
```

To undo everything: `node setup.js --uninstall --confirm`

**Want to see it in action first?** Run the interactive demo — no install needed:
```bash
npx grobomo/hook-runner --demo
```

## What does a block look like?

When Claude tries something a module blocks, the hook fires and Claude sees the block reason inline. Two examples from the `starter` workflow:

**Force push blocked:**
```
BLOCKED: Force-push to main is destructive and irreversible.
Use a regular push or create a revert commit instead.
```

**Destructive git command blocked:**
```
DESTRUCTIVE: git reset --hard destroys uncommitted changes permanently.
Alternatives:
  git stash        — save changes for later
  git reset --soft — move HEAD but keep changes staged
  git checkout <file> — revert specific files only
If you truly need --hard, ask the user first.
```

Claude reads the block message and adjusts its approach — no user intervention needed. Modules that pass return `null` silently, so there's zero overhead on normal operations.

## Workflows

Workflows are the primary abstraction. Instead of managing 115+ individual modules, you enable a workflow and its modules activate automatically.

```bash
node setup.js --workflow list              # see available workflows
node setup.js --workflow enable shtd       # enable the SHTD pipeline
node setup.js --workflow disable shtd      # disable it
node setup.js --workflow audit             # coverage report
node setup.js --workflow query Edit        # which workflows affect Edit?
```

### Built-in Workflows

| Workflow | Modules | What it enforces |
|----------|---------|-----------------|
| `starter` | 42 | **Start here.** Safe defaults for any user — blocks force-push, destructive git, secret commits, file deletion. Adds commit quality checks, test reminders, and session context. |
| `shtd` | 101 | Spec-Hook-Test-Driven — the full development pipeline. Enforces spec → branch → test → implement → PR, plus code quality, infrastructure safety, messaging guards, session lifecycle, and self-improvement. |
| `gsd` | 101 | GSD-driven development — replaces shtd's spec-based flow with phase-based flow (.planning/ → ROADMAP.md → phase plan → branch → execute → PR). Same safety and quality modules as shtd. |
| `customer-data-guard` | 3 | Read-only incident response — blocks env changes, data exfil, and V1 modifications. |
| `dispatcher-worker` | 3 | Role-aware fleet workflow. Dispatcher specs/distributes, workers implement/test/PR. |
| `no-local-docker` | 1 | Blocks local Docker commands, forces remote infrastructure. |
| `cross-project-reset` | 0 | Step template for cross-project context switching (cwd-drift-detector is in shtd). |

### Workflow State Machine

Active workflows track progress through steps:

```bash
node setup.js --workflow start shtd        # activate the pipeline
node setup.js --workflow status            # see current step
node setup.js --workflow complete spec     # mark spec step done
node setup.js --workflow reset             # clear active workflow
```

### Custom Workflows

Create `workflows/my-workflow.yml`:

```yaml
name: my-workflow
description: What this workflow enforces
version: 1
steps:
  - id: setup
    name: Set up environment
  - id: build
    name: Build the thing
    gate:
      require_step: setup
modules:
  - my-gate-module
```

Tag modules with `// WORKFLOW: my-workflow` in the first 5 lines.

### Workflow CRUD

```bash
node setup.js --workflow create my-flow    # generate YAML + stubs
node setup.js --workflow add-module my-flow my-gate  # create tagged module
node setup.js --workflow sync-live         # copy to live hooks dir
```

### Relaxed SHTD Mode

Projects without full speckit ceremony can use **TODO.md** as the task source:

- `spec-gate` accepts `- [ ] TXXX: description` entries in `TODO.md` (not just `specs/*/tasks.md`)
- `test-checkpoint-gate` auto-detects `scripts/test/test-TXXX*.sh` files as test coverage
- `worker-loop` gates `gh pr create` on test results — runs the test and blocks if it fails

This means a simple project needs only:
1. `TODO.md` with `- [ ] T001: ...` entries
2. `scripts/test/test-T001-*.sh` for each task
3. Feature branch per task (`git checkout -b 001-T001-slug`)

### Dispatcher/Worker Model

For fleet operations (CCC), enable the `dispatcher-worker` workflow. Roles are set via `CLAUDE_ROLE` env var:

- **Dispatcher** (`CLAUDE_ROLE=dispatcher`): specs tasks, writes acceptance tests, creates branches, distributes to workers, monitors, merges PRs
- **Worker** (`CLAUDE_ROLE=worker`): receives task + tests, implements until tests pass, creates PR
- **Single instance** (no `CLAUDE_ROLE`): both roles active, all gates enforced

## Modules

Modules are the building blocks. Each is a single `.js` file that receives hook input and returns a decision.

### Module Contract

```javascript
// ~/.claude/hooks/run-modules/PreToolUse/my-gate.js
// WORKFLOW: shtd
// WHY: Explain the real incident that caused this module to exist.
module.exports = function(input) {
  // input.tool_name: "Edit", "Write", "Bash", etc.
  // input.tool_input: { file_path, command, content, ... }
  if (shouldBlock) {
    return { decision: "block", reason: "WHY this is blocked" };
  }
  return null; // pass — allow the action
};
```

Rules:
- **Return null** to pass, `{decision: "block", reason: "..."}` to block
- **Sync or async** — return a Promise for async work (4s timeout)
- **Dependencies** — `// requires: mod1, mod2` in first 5 lines
- **Workflow tag** — `// WORKFLOW: name` restricts module to that workflow (comma-separated for multiple: `// WORKFLOW: shtd, starter`)

### Event Types

| Event | When it fires | Module returns |
|-------|--------------|----------------|
| **SessionStart** | New session begins | `{text: "context to inject"}` |
| **UserPromptSubmit** | User sends a message | `{decision: "block"}` or `null` |
| **PreToolUse** | Before Edit/Write/Bash | `{decision: "block"}` or `null` |
| **PostToolUse** | After Edit/Write | `{decision: "block"}` or `null` |
| **Stop** | Session ending | `{decision: "block"}` or `null` |

### Write Your First Module

Create a file that blocks `rm -rf` commands:

```bash
# Create the module file
cat > ~/.claude/hooks/run-modules/PreToolUse/no-rm-rf.js << 'EOF'
// WORKFLOW: shtd
// WHY: Accidentally ran rm -rf on a project directory.
module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";
  if (/rm\s+-rf/.test(cmd)) {
    return { decision: "block", reason: "Blocked rm -rf. Use archive/ instead." };
  }
  return null;
};
EOF
```

That's it. Next time Claude tries `rm -rf`, this module blocks it with a helpful message. No settings.json changes needed — the runner auto-discovers modules in the folder.

Test it in isolation before waiting for a real hook trigger:

```bash
node setup.js --test-module ~/.claude/hooks/run-modules/PreToolUse/no-rm-rf.js
```

### Project-Scoped Modules

Modules in a subfolder matching your project name only run for that project:

```
run-modules/PreToolUse/
  global-gate.js              # runs for ALL projects
  my-project/
    custom-gate.js            # runs ONLY when project name = "my-project"
```

## Architecture

```
~/.claude/hooks/
  run-pretooluse.js            # PreToolUse runner
  run-posttooluse.js           # PostToolUse runner
  run-stop.js                  # Stop runner
  run-sessionstart.js          # SessionStart runner
  run-userpromptsubmit.js      # UserPromptSubmit runner
  load-modules.js              # shared loader (global + project-scoped + workflow filtering)
  hook-log.js                  # centralized logging (JSONL)
  run-async.js                 # async module executor (Promise detection, 4s timeout)
  workflow.js                  # workflow engine (YAML state machine)
  run-modules/
    PreToolUse/*.js            # gate modules
    PostToolUse/*.js           # post-action checks
    Stop/*.js                  # session-end controls
    SessionStart/*.js          # context injection
    UserPromptSubmit/*.js      # prompt processing
  workflows/*.yml              # workflow definitions
```

Each runner reads stdin, discovers modules via `load-modules.js`, calls each in order. First block wins.

## CLI Reference

```bash
# Setup & Management
node setup.js                          # full setup wizard
node setup.js --yes                    # non-interactive setup + default workflows
node setup.js --report [--open]        # HTML hooks report
node setup.js --health                 # verify runners + modules
node setup.js --uninstall [--confirm]  # remove (--confirm restores backup)

# Modules
node setup.js --list                   # catalog vs installed comparison
node setup.js --sync [--dry-run]       # sync from GitHub per modules.yaml
node setup.js --export [file.yaml]     # export config as shareable YAML
node setup.js --upgrade [--dry-run]    # fetch latest from GitHub

# Workflows
node setup.js --workflow list          # available workflows
node setup.js --workflow enable <name> [--global]
node setup.js --workflow disable <name> [--global]
node setup.js --workflow audit         # coverage + orphan report
node setup.js --workflow query <tool>  # which workflows affect a tool
node setup.js --workflow create <name> # generate YAML + stubs
node setup.js --workflow add-module <workflow> <module>
node setup.js --workflow sync-live     # copy to live hooks

# Monitoring
node setup.js --stats                  # text summary of hook activity
node setup.js --perf                   # module timing analysis
node setup.js --integrity [--json]     # verify live modules match repo
node setup.js --report --analyze       # heuristic quality analysis
node setup.js --prune [N]             # prune log entries older than N days

# Demo & Development
node setup.js --demo [--fast]          # interactive demo (no install needed)
node setup.js --test-module <file> [--input <json>]  # test one module
node setup.js --test                   # run all test suites
node setup.js --version                # show version
node setup.js --help                   # show all commands
```

## Logging

Every module invocation is logged to `~/.claude/hooks/hook-log.jsonl` with timestamp, event, module name, result, execution time, and context. Log auto-rotates at 10MB.

The HTML report (`--report`) visualizes this data with hit counts, latency charts, and a flow diagram. The `--stats` command gives a quick text summary.

## Module Sync

Sync modules from GitHub to a new machine or keep an existing install updated:

```bash
# Create modules.yaml (pick which modules you want)
curl -fsSL https://raw.githubusercontent.com/grobomo/hook-runner/main/modules.example.yaml \
  > ~/.claude/hooks/modules.yaml

# Sync
node setup.js --sync              # install/update selected modules
node setup.js --sync --dry-run    # preview first
```

## Available Modules

Full catalog in `modules/` directory:

### PreToolUse (gates before tool execution)
| Module | Description |
|--------|-------------|
| `archive-not-delete` | Blocks file deletion, suggests archiving instead |
| `aws-tagging-gate` | Enforces required tags on AWS resource creation |
| `block-local-docker` | Blocks docker/docker-compose commands |
| `blueprint-no-sleep` | Blocks sleep between Blueprint MCP calls (pages load during prompt processing) |
| `branch-pr-gate` | Enforces feature branch → task branch → PR workflow |
| `claude-p-pattern` | Enforces correct `claude -p` invocation pattern |
| `commit-counter-gate` | Forces commit after every 5 edits — prevents losing work on context reset |
| `commit-quality-gate` | Blocks generic commit messages (< 5 words, "fix"/"update" without detail) |
| `victory-declaration-gate` | Blocks vague success claims in commit titles ("all tests pass", "all green", "100%") |
| `unresolved-issues-gate` | Scans TODO.md for unchecked FAIL/WARN/timeout tasks before allowing commit |
| `continuous-claude-gate` | Blocks code without tracked task workflow |
| `crlf-ssh-key-check` | Blocks SSH key copy without CRLF stripping |
| `cwd-drift-detector` | Blocks cross-project file access |
| `deploy-gate` | Blocks deploy commands when git tree is dirty |
| `deploy-history-reminder` | Shows last 5 commits before deploy — prevents repeating failed approaches |
| `disk-space-guard` | Blocks destructive commands after disk space errors |
| `e2e-self-report-gate` | Alias → `test-checkpoint-gate` (legacy name) |
| `enforcement-gate` | Requires git repo + TODO.md before edits |
| `env-var-check` | Blocks edits if required env vars missing |
| `force-push-gate` | Blocks git push --force to main/master |
| `gh-auto-gate` | Forces gh_auto wrapper for all gh/git push commands (EMU account safety) |
| `gsd-gate` | Alias → `test-checkpoint-gate` (legacy name) |
| `gsd-branch-gate` | Enforces GSD branch naming (seq-phase-N-slug) for new branches |
| `gsd-plan-gate` | Blocks code edits without a phase plan in GSD workflow |
| `gsd-pr-gate` | Validates PR creation follows GSD conventions |
| `git-destructive-guard` | Blocks git reset --hard, checkout ., clean -f without diagnosis |
| `git-rebase-safety` | Warns about reversed --ours/--theirs during rebase |
| `hook-editing-gate` | Enforces WORKFLOW tag, WHY comment, exit(1) in hook files |
| `instruction-to-hook-gate` | Converts user directives into hook modules |
| `messaging-safety-gate` | Blocks outbound messaging unless authorized |
| `cross-project-todo-gate` | Blocks writing cross-project TODOs into local TODO.md |
| `no-adhoc-commands` | Blocks raw aws/ssh/docker/kubectl/az/terraform, forces scripts/ |
| `no-focus-steal` | Blocks background processes that steal window focus |
| `no-fragile-heuristics` | Blocks pixel-counting heuristics |
| `reflection-gate` | Blocks edits if self-reflection found unresolved issues |
| `no-hardcoded-paths` | Blocks hardcoded absolute paths in code |
| `no-hook-bypass` | Blocks Bash cat/echo writes when Write/Edit is gated |
| `no-nested-claude` | Blocks nested claude -p calls (use context-reset for cross-project) |
| `no-passive-rules` | Blocks .md rules when a hook module is better |
| `no-rules-gate` | Blocks creation of ~/.claude/rules/ files (use hook modules instead) |
| `hook-system-reminder` | Reminds Claude that enforcement is ONLY via hook-runner modules |
| `inter-project-priority-gate` | Blocks non-XREF work when P0 inter-project TODOs are pending |
| `pr-first-gate` | Blocks spec/code edits on branches without an open PR |
| `pr-per-task-gate` | Requires task ID in PR titles |
| `preserve-iterated-content` | Warns on full-file rewrites of iterated files |
| `publish-json-guard` | Blocks edits to .github/publish.json and git remote config |
| `remote-tracking-gate` | Blocks edits if branch not pushed to remote |
| `root-cause-gate` | Blocks retry without root cause diagnosis |
| `secret-scan-gate` | Blocks commits with API keys or tokens |
| `settings-change-gate` | Requires rationale when modifying config |
| `settings-hooks-gate` | Blocks adding hooks directly to settings.json |
| `spec-before-code-gate` | Forces spec/TODO entry before first file modification after commit |
| `spec-gate` | Blocks code without specs/tasks.md |
| `task-completion-gate` | Blocks marking tasks complete without PR evidence |
| `test-checkpoint-gate` | Blocks code without e2e test (auto-detects `scripts/test/test-TXXX*.sh`) |
| `why-reminder` | Reminds to explain WHY before every code edit |
| `worker-loop` | Blocks PR creation until task's e2e test passes |
| `workflow-compliance-gate` | Blocks if globally enforced workflow disabled at project level |
| `workflow-gate` | Enforces step order in active workflows |
| `windowless-spawn-gate` | Blocks module writes using execSync without windowsHide:true |
| `worktree-gate` | Blocks feature branch edits unless session is in a git worktree |

#### Project-Scoped PreToolUse
| Module | Project | Description |
|--------|---------|-------------|
| `no-customer-env-changes` | ep-incident-response | Blocks infrastructure changes during incident response |
| `no-data-exfil` | ep-incident-response | Blocks data export/download during incident response |
| `v1-read-only` | ep-incident-response | Blocks Vision One write operations during incident response |
| `rdp-testbox-gate` | ddei-email-security | Reminds Claude of proven RDP pattern, separates user/Claude test servers |
| `share-is-generic` | ddei-email-security | Domain-specific gate for email security project |
| `use-workers` | hackathon26 | Forces delegation to fleet workers |

### PostToolUse (checks after tool execution)
| Module | Description |
|--------|-------------|
| `commit-msg-check` | Blocks WIP/fixup commits and long first lines |
| `crlf-detector` | Warns when Write/Edit produces CRLF in shell scripts, YAML, Python |
| `disk-space-detect` | Detects disk space errors in tool output, activates alert mode |
| `hook-autocommit` | Auto-commits hook module edits |
| `hook-health-monitor` | Detects hook crashes, exit code mismatches, timeouts, repeated failures |
| `rule-hygiene` | Validates rule files are single-topic, under 20 lines |
| `settings-audit-log` | Records config modifications to audit log |
| `test-coverage-check` | Warns when source files modified without tests |
| `troubleshoot-detector` | Detects fail-fail-succeed patterns |
| `update-stale-docs` | Detects stale docs after code edits |
| `empty-output-detector` | Warns when ls/cat/find/curl/kubectl/az return empty output |
| `inter-project-audit` | Logs inter-project TODO writes to JSONL audit trail |
| `result-review-gate` | Injects review checklist when reading report/PDF/coverage files |

### UserPromptSubmit (processes user prompts)
| Module | Description |
|--------|-------------|
| `instruction-detector` | Detects "always/never" directives for enforcement |
| `interrupt-detector` | Detects user interrupts, triggers self-analysis |
| `hook-integrity-monitor` | Spot-checks live module integrity each prompt (async, rate-limited) |
| `prompt-logger` | Logs prompts to JSONL for audit |

### Stop (controls session ending)
| Module | Description |
|--------|-------------|
| `auto-continue` | Blocks stopping — always find the next task |
| `chat-export` | Auto-exports session to HTML on stop |
| `config-sync` | Auto-commits and pushes ~/.claude changes to cloud backup |
| `drift-review` | Checks work matches the active spec task |
| `log-gotchas` | Captures debugging lessons before stopping |
| `mark-turn-complete` | Writes turn marker for interrupt detection |
| `never-give-up` | Blocks "impossible" — forces research first |
| `push-unpushed` | Blocks stop with unpushed commits |
| `reflection-score` | Gamified scoring system — tracks autonomy, corrections, streaks |
| `self-reflection` | LLM-powered review of recent gate decisions (async, calls claude -p) |
| `session-brain-analysis` | Sends session summary to unified-brain for cross-session analysis |
| `test-before-done` | Reminds to run e2e tests before done |
| `unresolved-issues-check` | Blocks session end with stale TESTING NOW/IN PROGRESS/WIP tasks |

#### Project-Scoped Stop
| Module | Project | Description |
|--------|---------|-------------|
| `delegate-and-monitor` | hackathon26 | Delegates tasks to fleet workers |

### SessionStart (injects context)
| Module | Description |
|--------|-------------|
| `backup-check` | Warns if config backup is stale |
| `drift-check` | Daily drift detection against last snapshot |
| `load-instructions` | Injects working instructions at session start |
| `load-lessons` | Injects recent self-analysis lessons |
| `hook-self-test` | Validates runner exit codes and block processing at session start |
| `lesson-effectiveness` | Detects repeated self-analysis lessons, escalates to gate candidates |
| `project-health` | Runs health check, warns about issues |
| `reflection-score-inject` | Injects reflection score/level/streak into session context |
| `session-cleanup` | Sweeps orphaned session-scoped temp files from crashed sessions |
| `session-collision-detector` | Warns if another Claude Code session is active on the same project |
| `terminal-title` | Sets terminal title to project folder name |
| `inter-project-priority` | Injects P0 inter-project TODOs (XREF tags) at session start |
| `workflow-summary` | Injects active workflow summary |

## Troubleshooting

**Module not running?**
- Check `node setup.js --health` for load errors
- Check `node setup.js --workflow audit` for workflow tag issues
- Check `node setup.js --list` to see if it's installed

**Hook blocked something it shouldn't?**
- Check `node setup.js --stats` to see which module blocked
- Read the module's `// WHY:` comment to understand intent
- Disable its workflow: `node setup.js --workflow disable <name>`

**Want to see what's happening?**
- `node setup.js --report --open` for visual overview
- `node setup.js --perf` for timing data
- Check `~/.claude/hooks/hook-log.jsonl` for raw logs

**Uninstall cleanly:**
- `node setup.js --uninstall --confirm` restores your original settings.json
