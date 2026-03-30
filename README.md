# hook-runner

Modular hook runner system for Claude Code. One runner per event, modules in folders. Drop a `.js` file in a folder to add behavior — no settings.json editing needed.

## Quick Start

```bash
# Install via grobomo marketplace (if not already added)
# In Claude Code: /install hook-runner

# Run the setup wizard
/hook-runner setup        # scan → report → backup → install → verify
/hook-runner report       # just see current hooks (HTML report)
/hook-runner dry-run      # preview changes without modifying anything
```

The setup wizard will:
1. Scan your current hooks and generate a styled HTML report
2. Show what hook-runner would look like
3. Back up all existing hook files to `~/.claude/hooks/archive/`
4. Install the runner system
5. Re-generate the report showing the result

## Architecture

```
~/.claude/hooks/
  load-modules.js              # shared loader (global + project-scoped)
  run-pretooluse.js            # PreToolUse runner
  run-posttooluse.js           # PostToolUse runner
  run-stop.js                  # Stop runner
  run-sessionstart.js          # SessionStart runner
  run-modules/
    PreToolUse/
      *.js                     # global modules (run for all projects)
      my-project/*.js          # project-scoped (only when project name matches)
    PostToolUse/*.js
    Stop/*.js
    SessionStart/*.js
```

## How It Works

Each `run-*.js` runner:
1. Reads stdin synchronously (`fs.readFileSync(0)`)
2. Uses `load-modules.js` to discover global + project-scoped modules
3. Calls each module with parsed input
4. First block/deny wins — remaining modules are skipped
5. If all return `null`, action is allowed

## Module Contract

```javascript
// run-modules/<Event>/my-gate.js
module.exports = function(input) {
  // PreToolUse/PostToolUse: input.tool_name, input.tool_input
  // Stop: input.session_id, input.stop_hook_active
  // SessionStart: return { text: "injected context" }
  if (shouldBlock) {
    return { decision: "block", reason: "Why it's blocked" };
  }
  return null; // pass
};
```

Rules:
- **Synchronous only** — no async/await, no Promises, use `require()` not `import`
- **Return null to pass**, `{decision: "block", reason: "..."}` to block
- **Alphabetical order** — prefix with `01-` to control execution order
- **Never edit settings.json** — runners are already registered, just add module files

## Event Types

| Event | Runner | Matchers | Module Return |
|-------|--------|----------|---------------|
| SessionStart | run-sessionstart.js | none | `{text: "..."}` |
| PreToolUse | run-pretooluse.js | Edit, Write, Bash | `{decision: "block"}` or `null` |
| PostToolUse | run-posttooluse.js | Edit, Write | `{decision: "block"}` or `null` |
| Stop | run-stop.js | none | `{decision: "block"}` or `null` |

## Logging

Runners log every module invocation to `~/.claude/hooks/hook-log.jsonl`. Each line records the timestamp, event, module name, result (pass/block/error), and context (tool name, command snippet, project). The log auto-rotates at 10MB.

The setup report (`/hook-runner report`) reads the log and shows hit counts and sample triggers per module.

## Project-Scoped Modules

Modules in a subfolder matching your project name only run for that project:

```
run-modules/PreToolUse/
  global-gate.js              # runs for ALL projects
  my-project/
    custom-gate.js            # runs ONLY when CLAUDE_PROJECT_DIR basename = "my-project"
```

## Module Sync

Sync modules from GitHub to a new machine (or keep an existing install updated):

```bash
# 1. Install the runner system
/hook-runner setup

# 2. Create ~/.claude/hooks/modules.yaml (pick which modules you want)
curl -fsSL https://raw.githubusercontent.com/grobomo/hook-runner/main/modules.example.yaml > ~/.claude/hooks/modules.yaml
# Edit modules.yaml — comment out modules you don't want

# 3. Sync
/hook-runner sync            # install/update selected modules
/hook-runner sync-dry-run    # preview first
```

## Available Modules

Full catalog in `modules/` directory:

### PreToolUse (gates before tool execution)
| Module | Description |
|--------|-------------|
| `enforcement-gate` | Requires git repo + TODO.md. Dirty-tree check on main only. |
| `branch-pr-gate` | Model C workflow: feature branch → task branch → PR |
| `remote-tracking-gate` | Blocks edits if branch not pushed to remote |
| `spec-gate` | Blocks code without specs/tasks.md |
| `gsd-gate` | Blocks code without e2e test in checkpoint |
| `continuous-claude-gate` | Blocks code without tracked task workflow |
| `root-cause-gate` | Blocks retry/cleanup without root cause diagnosis |
| `archive-not-delete` | Blocks `rm -rf`, forces `mv` to `archive/` |
| `no-adhoc-commands` | Blocks raw aws/ssh/docker/kubectl, forces scripts/ |
| `aws-tagging-gate` | Enforces required tags on AWS resource creation (env-configurable) |

### PostToolUse (checks after tool execution)
| Module | Description |
|--------|-------------|
| `rule-hygiene` | Validates rule files are single-topic, under 20 lines |

### Stop (controls session ending)
| Module | Description |
|--------|-------------|
| `auto-continue` | Blocks stopping — always find the next task |
| `push-unpushed` | Blocks stop if unpushed commits on feature branch |

### SessionStart (injects context)
| Module | Description |
|--------|-------------|
| `load-instructions` | Injects working instructions at session start |
