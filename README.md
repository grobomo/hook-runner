# hook-runner

[![Tests](https://github.com/grobomo/hook-runner/actions/workflows/test.yml/badge.svg)](https://github.com/grobomo/hook-runner/actions/workflows/test.yml)

Modular hook system for Claude Code. Enforce workflows, block mistakes, inject context — all with plain `.js` files in folders. No settings.json editing needed.

**New here?** Start with the [Getting Started guide](GETTING-STARTED.md) — zero to guardrails in 5 minutes.

## What is hook-runner?

Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) let you run scripts at key moments: before a tool runs, after it runs, when a session starts, when it stops. hook-runner turns this into a **module system** — drop a `.js` file in a folder and it runs automatically.

On top of modules, **workflows** group related modules into enforceable pipelines. Enable a workflow and its modules activate together. Disable it and they all go silent. This gives you a single place to organize all your hook behavior — no more hunting through `settings.json` entries.

## Why hook-runner?

Claude Code hooks are powerful but raw: you write shell commands in `settings.json`, they run on every invocation, and there's no structure. This works with three hooks. It doesn't work when you have 30+ enforcement rules, some that only apply in certain contexts, and you need to turn groups on and off.

hook-runner replaces direct `settings.json` editing. After install, you never touch `settings.json` for hooks again — hook-runner owns all five events and routes to your modules automatically.

**1. Modules over shell commands.** Each rule is a `.js` file that receives structured input (tool name, file path, command) and returns a decision. Modules are testable, documented, and version-controlled. Drop a file in a folder and it runs — remove it and it stops.

**2. Workflows over individual modules.** You don't think "I need to enable spec-gate, branch-gate, test-checkpoint-gate, and worker-loop." You think "I want the SHTD development pipeline." Workflows group related modules so you enable one name and get a complete enforcement regime. Disable it and they all go silent. This is how you manage 180+ modules without losing track.

**3. Portability.** Export your module config as YAML (`--export`), sync it to another machine (`--sync`), or share a workflow definition. Workflows also make it easy to switch contexts — enable `customer-data-guard` during incident response, disable it after.

## How the System Decides

Every time Claude finishes a response, the **Stop hook** fires. Here's exactly what happens:

```
Claude finishes responding
  → run-stop.js loads gates from run-modules/Stop/1-haiku/
  → Each gate calls Haiku (fast LLM) with:
      - Rules from ~/.claude/hooks/rules/stop/*.yaml
      - Last assistant response (what Claude just said)
      - Unchecked TODO items from the project
      - Prior mandate context (if any)
  → Haiku evaluates ALL rules and returns:
      - DONE = Claude may stop (work is complete)
      - CONTINUE = keep working (rule triggered)
      - NEXT = start the next TODO item
      - DISPATCH = work belongs in another project
  → Gate returns {decision: "block", reason: "SELF-CHECK [rule]: DECISION — ..."}
  → run-stop.js writes to stderr (visible in TUI) and stdout (read by Claude Code)
  → Exit 1 = block shown in TUI. Exit 0 = invisible (never allowed).
  → If ALL gates fail: safety net forces output anyway.
```

**PreToolUse gates** fire before every tool call. They're mechanical (regex, file checks — no LLM):
- `todo-gate.js` — blocks code changes without a tracked TODO item
- `git-destructive-guard.js` — blocks force-push, reset --hard, etc.
- `archive-not-delete.js` — blocks `rm`, forces `mv archive/`
- `gate-quality-gate.js` — enforces naming and documentation on new gates
- `promises-to-gates-gate.js` — blocks behavioral promises, requires gate creation

**PostToolUse gates** fire after tools complete. They observe and log:
- `hook-autocommit-gate.js` — auto-commits gate changes to backup repo
- `spirit-check.js` — audits tool calls against spirit rules

**The decision hierarchy:** Haiku rules (behavioral, evaluated by LLM) → PreToolUse gates (structural, regex) → PostToolUse gates (observational). Haiku guides. Gates enforce. Together they compensate for Claude's lack of persistent memory.

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
4. Enable the `starter` workflow (with `--yes`) — 76 universally useful modules

Ready for more? Enable the full development pipeline:
```bash
node setup.js --workflow enable shtd    # 135 modules: spec-first, test-first, PR discipline
```

To undo everything: `node setup.js --uninstall --confirm`

**Want to see it in action first?** Run the interactive demo — no install needed:
```bash
npx grobomo/hook-runner --demo          # terminal demo
npx grobomo/hook-runner --demo-html     # shareable HTML page
```

## What hook-runner replaces

Without hook-runner, you write shell commands directly in `settings.json` — one per event, no structure:

```json
"hooks": {
  "PreToolUse": [{
    "matcher": "Bash",
    "hooks": [{ "type": "command", "command": "node check-force-push.js" }]
  }]
}
```

With hook-runner, `settings.json` has exactly **one entry per event** that routes to the runner. You never edit it again — just drop `.js` files in folders:

```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Edit",  "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/run-hidden.js\" run-pretooluse.js" }] },
    { "matcher": "Write", "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/run-hidden.js\" run-pretooluse.js" }] },
    { "matcher": "Bash",  "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/run-hidden.js\" run-pretooluse.js" }] }
  ]
}
```

The setup wizard (`node setup.js --yes`) writes this for you.

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

Workflows are the primary abstraction. Instead of managing 120+ individual modules, you enable a workflow and its modules activate automatically.

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
| `starter` | 76 | **Start here.** Safe defaults for any user — blocks force-push, destructive git, secret commits, file deletion. Adds commit quality checks, test reminders, and session context. |
| `shtd` | 135 | Spec-Hook-Test-Driven — the full development pipeline. Enforces spec → branch → test → implement → PR, plus code quality, infrastructure safety, messaging guards, session lifecycle, and self-improvement. |
| `gsd` | 76 | GSD-driven development — replaces shtd's spec-based flow with phase-based flow (.planning/ → ROADMAP.md → phase plan → branch → execute → PR). Same safety and quality modules as shtd. |
| `haiku-rules` | 69 | LLM-augmented gates — Haiku-powered semantic analysis for ambiguous decisions. Includes stop analysis, auto-continue, mandate enforcement. |
| `autonomous` | extends haiku-rules | Unattended operation — self-correction, reflection, RCA enforcement, TODO tracking, operational hygiene. |
| `customer-data-guard` | 4 | Read-only incident response — blocks env changes, data exfil, and V1 modifications. |
| `no-local-docker` | 2 | Blocks local Docker commands, forces remote infrastructure. |

### Workflow State Machine

Active workflows track progress through steps:

```bash
node setup.js --workflow start shtd        # activate the pipeline
node setup.js --workflow status            # see current step
node setup.js --workflow complete spec     # mark spec step done
node setup.js --workflow reset             # clear active workflow
```

### What a real workflow looks like

Here's the `starter` workflow (excerpt from `workflows/starter.yml`):

```yaml
name: starter
description: Safe defaults for any Claude Code user.
version: 2
enabled: true

modules:
  # Git safety — prevent irreversible mistakes
  - force-push-gate
  - git-destructive-guard
  - secret-scan-gate
  - commit-quality-gate
  # File safety
  - archive-not-delete
  # Code quality
  - no-hardcoded-paths
  - test-coverage-check
  # Session management
  - stop-fired-check-gate
```

Each module name maps to a `.js` file in `modules/{Event}/`. The workflow tag in the file (`// WORKFLOW: starter`) links them:

```javascript
// modules/PreToolUse/force-push-gate.js
// WORKFLOW: starter
// WHY: Force push destroyed the gate system — 142 modules lost, 3 hours to recover.
module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";
  if (/git\s+push\s+.*--force/.test(cmd)) {
    return { decision: "block", reason: "Force-push blocked. Use a regular push or revert commit." };
  }
  return null;
};
```

### Custom Workflows

Create `workflows/my-workflow.yml`:

```yaml
name: my-workflow
description: What this workflow enforces
version: 1
modules:
  - my-gate-module
```

Tag modules with `// WORKFLOW: my-workflow` in the first 5 lines.

### Workflow Templates

Start from a curated template instead of a blank scaffold:

```bash
node setup.js --workflow templates                              # list available templates
node setup.js --workflow create my-sec --from-template security # pre-populated with 10 modules
```

| Template | Modules | Focus |
|----------|---------|-------|
| `security` | 10 | Git safety, secret scanning, account protection |
| `quality` | 9 | Code quality, testing discipline, commit hygiene |
| `lifecycle` | 11 | Session management, continuity, health monitoring |
| `minimal` | 3 | Absolute minimum safety (force-push, destructive-git, secrets) |

### Workflow CRUD

```bash
node setup.js --workflow create my-flow                         # blank scaffold
node setup.js --workflow create my-flow --from-template quality # from template
node setup.js --workflow add-module my-flow my-gate             # create tagged module
node setup.js --workflow sync-live                              # copy to live hooks dir
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
node setup.js --test-module no-rm-rf    # resolves by name from any event folder
```

### Project-Scoped Modules

Modules in a subfolder matching your project name only run for that project:

```
run-modules/PreToolUse/
  global-gate.js              # runs for ALL projects
  my-project/
    custom-gate.js            # runs ONLY when project name = "my-project"
```

## Enforcement Philosophy: Gates > Rules > Memory

| Tier | Mechanism | Strength | Use For |
|------|-----------|----------|---------|
| **1. Gates** | PreToolUse/PostToolUse modules | Mechanical — cannot bypass | All behavioral enforcement (default) |
| **2. Haiku Rules** | stop-haiku-rules.yaml | LLM judgment — context-aware | Decisions needing context; should reference gate results |
| **3. Native Rules** | .claude/rules/, MEMORY.md | Weakest — forgotten across resets | **BANNED** for enforcement. Use CLAUDE.md for docs only |

Every behavioral requirement should be a gate unless it requires LLM judgment. Haiku rules should reference gate outputs, not reimplement checks. See [CLAUDE.md](CLAUDE.md#enforcement-philosophy-gates--rules--memory) for full details.

## Architecture

### Installed layout (`~/.claude/hooks/`)

```
~/.claude/hooks/
  run-hidden.js                # entry point (stdin → runner dispatch)
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
    PreToolUse/*.js            # gate modules (block before action)
    PostToolUse/*.js           # observation modules (warn after action, never block)
    Stop/*.js                  # session-end controls (continue/done decisions)
    SessionStart/*.js          # context injection (inject text into session)
    UserPromptSubmit/*.js      # prompt processing
  rules/stop/*.yaml            # Haiku stop rules (LLM-evaluated at session end)
  workflows/*.yml              # workflow definitions
```

### Repo layout

```
hook-runner/
  setup.js, report.js, ...    # development copies (canonical — edit these)
  cli/                         # npm package: CLI entry points (synced from root)
  src/                         # npm package: shared libraries (synced from root)
  runners/                     # npm package: event runners (synced from root)
  modules/                     # module catalog (copied to run-modules/ on install)
  workflows/                   # workflow definitions (copied on install)
  rules/                       # stop rules (copied on install)
  scripts/test/                # test suites (274 suites)
  docs/                        # architecture docs and specs
```

Root `.js` files are the development copies. `cli/`, `src/`, and `runners/` are the npm package distribution — kept in sync via the hygiene audit (`scripts/project-hygiene.js`).

### Execution flow

Each runner reads stdin (hook input from Claude Code), discovers modules via `load-modules.js`, calls each in order. First block wins — remaining modules are skipped.

```
Claude Code triggers hook event
  → settings.json calls run-hidden.js with event name
  → run-hidden.js delegates to the event runner (e.g. run-pretooluse.js)
  → Runner calls load-modules.js:
      1. Scans run-modules/{Event}/ for .js files
      2. Filters by workflow tag (only enabled workflow modules load)
      3. Filters by TOOLS tag (skip if tool doesn't match)
      4. Checks dependencies (// requires: tag)
  → Runner calls each module with {tool_name, tool_input, ...}
  → Module returns null (pass) or {decision: "block", reason: "..."}
  → First block → exit 1 + stderr message → Claude sees the block
  → All pass → exit 0 → Claude proceeds
```

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
node setup.js --list --why             # browse modules with descriptions
node setup.js --search <query>         # find modules by name or description
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
node setup.js --demo-html              # generate standalone HTML demo page
node setup.js --test-module <name> [--input <json>]  # test one module (name or path)
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
| `audit-log-protect-gate` | Blocks deletion/truncation/overwrite of JSONL log files and audit trail |
| `automate-everything-gate` | Blocks manual lint/check commands (flake8, pylint, shellcheck, etc.), forces CI/CD pipeline |
| `aws-tagging-gate` | Enforces required tags on AWS resource creation |
| `block-local-docker` | Blocks docker/docker-compose commands |
| `blueprint-no-sleep` | Blocks sleep between Blueprint MCP calls (pages load during prompt processing) |
| `branch-pr-gate` | Enforces feature branch → task branch → PR workflow |
| `claude-p-pattern` | Enforces correct `claude -p` invocation pattern |
| `commit-counter-gate` | Forces commit after every 15 edits — prevents losing work on context reset |
| `commit-quality-gate` | Blocks generic commit messages (< 5 words, "fix"/"update" without detail) |
| `victory-declaration-gate` | Blocks vague success claims in commit titles ("all tests pass", "all green", "100%") |
| `violation-gate` | Blocks after spirit-check detects a violation — forces reading analysis and correction |
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
| `gate-quality-gate` | Enforces naming, WHY/TOOLS tags, incident history, and logging on hook modules |
| `gh-auto-gate` | Forces gh_auto wrapper for all gh/git push commands (EMU account safety) |
| `gsd-gate` | Alias → `test-checkpoint-gate` (legacy name) |
| `gsd-branch-gate` | Enforces GSD branch naming (seq-phase-N-slug) for new branches |
| `gsd-plan-gate` | Blocks code edits without a phase plan in GSD workflow |
| `gsd-pr-gate` | Validates PR creation follows GSD conventions |
| `git-destructive-guard` | Blocks git reset --hard, checkout ., clean -f without diagnosis |
| `git-rebase-safety` | Warns about reversed --ours/--theirs during rebase |
| `hook-editing-gate` | Enforces WORKFLOW tag, WHY comment, exit(1) in hook files |
| `hook-log-review-gate` | Requires hook-log.jsonl review before creating/editing hook modules |
| `instruction-to-hook-gate` | Converts user directives into hook modules |
| `messaging-safety-gate` | Blocks outbound messaging unless authorized |
| `cross-project-todo-gate` | Blocks writing cross-project TODOs into local TODO.md |
| `no-adhoc-commands` | Blocks raw aws/ssh/docker/kubectl/az/terraform, forces scripts/ |
| `no-focus-steal` | Blocks background processes that steal window focus |
| `no-fragile-heuristics` | Blocks pixel-counting heuristics |
| `reflection-gate` | Blocks edits if self-reflection found unresolved issues |
| `no-hardcoded-paths` | Blocks hardcoded absolute paths in code |
| `no-lessons-file-gate` | Blocks writes to lessons.jsonl — forces hook module creation instead |
| `no-hook-bypass` | Blocks Bash cat/echo writes when Write/Edit is gated |
| `no-nested-claude` | Blocks nested claude -p calls (use context-reset for cross-project) |
| `no-passive-rules` | Blocks .md rules when a hook module is better |
| `no-playwright-direct` | Blocks raw mcp__playwright__* calls, requires Blueprint Extra MCP |
| `blueprint-only-browser-gate` | Blocks Bash Selenium/Playwright/Puppeteer/ChromeDriver, redirects to Blueprint MCP |
| `no-polling-gate` | Blocks LLM-driven polling (loops+sleep, log tailing, comment watching, watch) |
| `no-native-memory-gate` | Blocks writes to ~/.claude/rules/, MEMORY.md, .claude/memory/ (use hook modules instead) |
| `tunnel-check-gate` | Blocks process-grep SSH tunnel checks, suggests port connectivity test |
| `hook-system-reminder` | Reminds Claude that enforcement is ONLY via hook-runner modules |
| `inter-project-priority-gate` | Blocks non-XREF work when P0 inter-project TODOs are pending |
| `mandate-gate` | Enforces Haiku stop-hook directives — blocks first tool call until Opus reads the mandate |
| `mcp-manager-gate` | Blocks direct MCP server entries in .mcp.json and relay scripts |
| `process-kill-gate` | Blocks bulk process termination (kill -9 -1, killall, pkill), allows specific PIDs |
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
| `worktree-scope-guard-gate` | Blocks EnterWorktree unless name matches project context |
| `blueprint-guidance-gate` | Pattern-based guidance for Blueprint MCP usage (V1 incognito, SharePoint tabs) |
| `portal-verify-gate` | Blocks cost validation completion without fresh portal evidence |
| `sibling-session-detect-gate` | Non-blocking: warns when multiple sessions run in same project |
| `stop-fired-check-gate` | Detects when stop hook failed to fire for previous turns |
| `transcript-shared-reader-gate` | Shared JSONL transcript parsing helper for cross-module use |

#### Project-Scoped PreToolUse
| Module | Project | Description |
|--------|---------|-------------|
| `no-customer-env-changes` | ep-incident-response | Blocks infrastructure changes during incident response |
| `no-data-exfil` | ep-incident-response | Blocks data export/download during incident response |
| `v1-read-only` | ep-incident-response | Blocks Vision One write operations during incident response |
| `rdp-testbox-gate` | ddei-email-security | Reminds Claude of proven RDP pattern, separates user/Claude test servers |
| `share-is-generic` | ddei-email-security | Domain-specific gate for email security project |
| `use-workers` | hackathon26 | Forces delegation to fleet workers |
| `dashboard-deploy-reminder-gate` | llm-token-tracker | Non-blocking reminder on dashboard file edits |
| `no-local-dashboard-gate` | llm-token-tracker | Blocks curls to local dashboard API — forces prod verification |

### PostToolUse (monitoring after tool execution — never blocks, T803)
| Module | Description |
|--------|-------------|
| `background-task-audit` | Warns when background tasks return zero output |
| `commit-msg-check` | Warns on WIP/fixup commits and long first lines |
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
| `file-naming-check` | Validates file naming conventions for hook modules |
| `git-commit-reminder-check` | Reminds to commit TODO.md/docs/specs changes (15-min cooldown) |
| `inter-project-audit` | Logs inter-project TODO writes to JSONL audit trail |
| `result-review-gate` | Injects review checklist when reading report/PDF/coverage files |
| `test-evidence` | Records test pass/fail counts to evidence file for victory-gate validation |
| `no-infra-excuse` | Warns against infrastructure excuses — reminds Claude it has AWS/Azure/RONE available |
| `script-not-oneoff-check` | Warns when writing one-off scripts instead of reusable project scripts |
| `spirit-check` | LLM audits tool calls against spirit-rules.yaml — catches creative workarounds that JS gates miss |
| `decision-log-gate` | Warns when editing hook infrastructure without a decisions.jsonl entry |
| `verify-todo-completion-gate` | Verifies file references when TODO items are marked done |
| `portal-evidence-recorder-gate` | Records Blueprint portal navigations for portal-verify-gate evidence |
| `user-correction-detector` | Real-time detection of user corrections via prompt-log.jsonl pattern matching |
| `post-tool-use-gate` | LLM-powered analysis of tool results for quality and correctness |
| `tool-event-guard` | Emits `tool.used` events to `$CLAUDE_EVENT_LOG` for worker observability (no-op locally) |

### Stop (session exit analysis)
| Module | Description |
|--------|-------------|
| `auto-continue-gate` | LLM decides whether to continue, write mandate, or dispatch work |
| `stop-analysis-gate` | LLM analyzes stop reason and suggests next steps |
| `status-emitter-guard` | Emits `claude.stopped` events to `$CLAUDE_EVENT_LOG` for worker observability (no-op locally) |
| `auto-continue` | Simple pattern-based auto-continue (fallback for non-Haiku envs) |
| `never-give-up` | Blocks stopping when TODO items remain |
| `self-reflection` | Tries unified-brain /ask endpoint for session reflection |
| `test-before-done` | Blocks "done" when tests haven't been run |

### UserPromptSubmit (processes user prompts)
| Module | Description |
|--------|-------------|
| `instruction-detector` | Detects "always/never" directives for enforcement |
| `interrupt-detector` | Detects user interrupts, triggers self-analysis |
| `hook-integrity-monitor` | Spot-checks live module integrity each prompt (async, rate-limited) |
| `prompt-logger` | Logs prompts to JSONL for audit |

### SessionStart (injects context)
| Module | Description |
|--------|-------------|
| `api-watcher` | Spawns API connectivity watcher on start — auto-recovers from outages |
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
| `proxy-routing-check-gate` | Verifies ANTHROPIC_BASE_URL routes through local proxy |
| `stop-hook-verify-check` | Verifies stop hook runners and modules are healthy on session start |
| `unauthorized-change-check` | Detects undocumented changes to hook infrastructure via SHA256 hashing |

## Reliability & Failure Modes

| Failure | Behavior | Risk |
|---------|----------|------|
| Module throws an error | Caught by runner — logged to `hook-log.jsonl`, module skipped, pipeline continues. Other modules still evaluate. | Low — fail-open per module |
| Module hangs | 4-second timeout (`run-async.js`). Module killed, logged as timeout, pipeline continues. | Low — bounded by timeout |
| All modules fail | Safety net forces output anyway. Claude is never silently stuck. | Low |
| Haiku API offline | `_haiku-judge.js` health-checks proxy with 60s cache. If down, returns `fallback_used: true` and the configured fallback (`"allow"` or `"block"` per gate). | Medium — semantic gates degrade to pass-through |
| Haiku API slow | 5-second timeout on judge calls. Falls back same as offline. | Low |
| Circular `// requires:` deps | `load-modules.js` validates before loading. Missing deps = module skipped with log entry. No circular detection needed — deps are one-level only. | Low |
| Two modules conflict | First block wins. Module load order is filesystem order (alphabetical). No priority system — design modules to be independent. | Design-time concern |
| Malicious module in `run-modules/` | Modules run in the same Node process as the runner. A malicious module could read env vars or modify other modules. Mitigate with `unauthorized-change-check` (SessionStart SHA256 verification) and `hook-editing-gate` (blocks edits to hook files from non-hook-runner projects). | Medium — trust boundary is the module author |

### Performance

Typical latency per hook invocation (measured with `node setup.js --perf`):

| Event | Modules loaded | Avg latency | Notes |
|-------|---------------|-------------|-------|
| PreToolUse | 5-15 (TOOLS filter) | 2-8ms | Only modules matching the tool name load |
| PostToolUse | 3-8 | 1-5ms | Never blocks (T803) |
| Stop | 5-10 + Haiku call | 1-3s | Haiku evaluates 30+ rules in one call |
| SessionStart | 8-12 | 50-200ms | File I/O for health checks |

The `// TOOLS:` tag is the primary performance optimization — a module tagged `// TOOLS: Bash` never loads for Edit/Write calls, saving ~5ms per skipped module.

## Troubleshooting

**Something broken? Run diagnostics first:**
- `node setup.js --diagnose [project-dir]` — shows all settings files, hooks, broken scripts, and suggests fixes. Add `--fix` to auto-repair, `--json` for machine-readable output.

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
