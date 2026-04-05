# hook-runner

[![Tests](https://github.com/grobomo/hook-runner/actions/workflows/test.yml/badge.svg)](https://github.com/grobomo/hook-runner/actions/workflows/test.yml)

Modular hook system for Claude Code. Enforce workflows, block mistakes, inject context — all with plain `.js` files in folders. No settings.json editing needed.

## What is hook-runner?

Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) let you run scripts at key moments: before a tool runs, after it runs, when a session starts, when it stops. hook-runner turns this into a **module system** — drop a `.js` file in a folder and it runs automatically.

On top of modules, **workflows** group related modules into enforceable pipelines. Enable a workflow and its modules activate together. Disable it and they all go silent. This is how you scale from one person's preferences to a team's engineering standards.

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
4. Enable default workflows (with `--yes`)

To undo everything: `node setup.js --uninstall --confirm`

## Workflows

Workflows are the primary abstraction. Instead of managing 30+ individual modules, you enable a workflow and its modules activate automatically.

```bash
node setup.js --workflow list              # see available workflows
node setup.js --workflow enable shtd       # enable the SHTD pipeline
node setup.js --workflow disable shtd      # disable it
node setup.js --workflow audit             # coverage report
node setup.js --workflow query Edit        # which workflows affect Edit?
```

### Built-in Workflows

| Workflow | What it enforces |
|----------|-----------------|
| `shtd` | Spec → tasks → branch → test → implement → PR. The full development pipeline. |
| `messaging-safety` | Blocks outbound messages (Teams, email) unless the target is explicitly authorized. |
| `no-local-docker` | Blocks local Docker commands, forces remote infrastructure. |
| `cross-project-reset` | Blocks cross-project file access, forces proper project switching. |
| `enforce-shtd` | Extended SHTD that requires a workflow YAML definition step. |

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
- **Workflow tag** — `// WORKFLOW: name` restricts module to that workflow

### Event Types

| Event | When it fires | Module returns |
|-------|--------------|----------------|
| **SessionStart** | New session begins | `{text: "context to inject"}` |
| **UserPromptSubmit** | User sends a message | `{decision: "block"}` or `null` |
| **PreToolUse** | Before Edit/Write/Bash | `{decision: "block"}` or `null` |
| **PostToolUse** | After Edit/Write | `{decision: "block"}` or `null` |
| **Stop** | Session ending | `{decision: "block"}` or `null` |

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
node setup.js --prune [N]             # prune log entries older than N days

# Development
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
| `aws-tagging-gate` | Enforces required tags on AWS resource creation |
| `block-local-docker` | Blocks docker/docker-compose commands |
| `branch-pr-gate` | Enforces feature branch → task branch → PR workflow |
| `claude-p-pattern` | Enforces correct `claude -p` invocation pattern |
| `continuous-claude-gate` | Blocks code without tracked task workflow |
| `cwd-drift-detector` | Blocks cross-project file access |
| `crlf-ssh-key-check` | Blocks SSH key copy without CRLF stripping |
| `enforcement-gate` | Requires git repo + TODO.md before edits |
| `env-var-check` | Blocks edits if required env vars missing |
| `git-rebase-safety` | Warns about reversed --ours/--theirs during rebase |
| `test-checkpoint-gate` | Blocks code without e2e test (auto-detects `scripts/test/test-TXXX*.sh`) |
| `instruction-to-hook-gate` | Converts user directives into hook modules |
| `messaging-safety-gate` | Blocks outbound messaging unless authorized |
| `no-adhoc-commands` | Blocks raw aws/ssh/docker/kubectl, forces scripts/ |
| `no-focus-steal` | Blocks background processes that steal window focus |
| `no-fragile-heuristics` | Blocks pixel-counting heuristics |
| `no-hardcoded-paths` | Blocks hardcoded absolute paths in code |
| `no-passive-rules` | Blocks .md rules when a hook module is better |
| `pr-per-task-gate` | Requires task ID in PR titles |
| `preserve-iterated-content` | Warns on full-file rewrites of iterated files |
| `remote-tracking-gate` | Blocks edits if branch not pushed to remote |
| `root-cause-gate` | Blocks retry without root cause diagnosis |
| `secret-scan-gate` | Blocks commits with API keys or tokens |
| `settings-change-gate` | Requires rationale when modifying config |
| `spec-gate` | Blocks code without specs/tasks.md |
| `why-reminder` | Reminds to explain WHY before every code edit |
| `worker-loop` | Blocks PR creation until task's e2e test passes |
| `workflow-gate` | Enforces step order in active workflows |

#### Project-Scoped PreToolUse
| Module | Project | Description |
|--------|---------|-------------|
| `share-is-generic` | ddei-email-security | Domain-specific gate for email security project |
| `use-workers` | hackathon26 | Forces delegation to fleet workers |

### PostToolUse (checks after tool execution)
| Module | Description |
|--------|-------------|
| `commit-msg-check` | Blocks WIP/fixup commits and long first lines |
| `hook-autocommit` | Auto-commits hook module edits |
| `rule-hygiene` | Validates rule files are single-topic, under 20 lines |
| `settings-audit-log` | Records config modifications to audit log |
| `test-coverage-check` | Warns when source files modified without tests |
| `troubleshoot-detector` | Detects fail-fail-succeed patterns |
| `update-stale-docs` | Detects stale docs after code edits |

### UserPromptSubmit (processes user prompts)
| Module | Description |
|--------|-------------|
| `instruction-detector` | Detects "always/never" directives for enforcement |
| `interrupt-detector` | Detects user interrupts, triggers self-analysis |
| `prompt-logger` | Logs prompts to JSONL for audit |

### Stop (controls session ending)
| Module | Description |
|--------|-------------|
| `auto-continue` | Blocks stopping — always find the next task |
| `drift-review` | Checks work matches the active spec task |
| `log-gotchas` | Captures debugging lessons before stopping |
| `mark-turn-complete` | Writes turn marker for interrupt detection |
| `never-give-up` | Blocks "impossible" — forces research first |
| `push-unpushed` | Blocks stop with unpushed commits |
| `test-before-done` | Reminds to run e2e tests before done |

#### Project-Scoped Stop
| Module | Project | Description |
|--------|---------|-------------|
| `delegate-and-monitor` | hackathon26 | Delegates tasks to fleet workers |

### SessionStart (injects context)
| Module | Description |
|--------|-------------|
| `backup-check` | Warns if config backup is stale |
| `config-sync` | Auto-syncs ~/.claude config to git remote |
| `load-instructions` | Injects working instructions at session start |
| `load-lessons` | Injects recent self-analysis lessons |
| `project-health` | Runs health check, warns about issues |
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
