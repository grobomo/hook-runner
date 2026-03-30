---
name: hook-runner
description: "Modular hook runner for Claude Code. One runner per event, modules in folders. Setup wizard migrates existing hooks."
keywords:
  - hook
  - hooks
  - runner
  - pretooluse
  - posttooluse
  - stop
  - sessionstart
  - enforcement
  - gate
  - module
custom_commands:
  - name: setup
    command: "node $SKILL_DIR/setup.js"
    description: "Run hook-runner setup wizard — scans hooks, shows report, backs up, installs"
  - name: report
    command: "node $SKILL_DIR/setup.js --report"
    description: "Generate hooks report without installing"
  - name: dry-run
    command: "node $SKILL_DIR/setup.js --dry-run"
    description: "Preview what hook-runner would change without modifying anything"
  - name: sync
    command: "node $SKILL_DIR/setup.js --sync"
    description: "Sync modules from GitHub per ~/.claude/hooks/modules.yaml"
  - name: sync-dry-run
    command: "node $SKILL_DIR/setup.js --sync --dry-run"
    description: "Preview module sync without installing"
---

# hook-runner

Modular hook runner system for Claude Code. Replaces per-hook entries in settings.json with a runner + module architecture.

## Architecture

```
~/.claude/hooks/
  load-modules.js              # shared loader (global + project-scoped)
  run-pretooluse.js            # PreToolUse runner
  run-posttooluse.js           # PostToolUse runner
  run-stop.js                  # Stop runner
  run-sessionstart.js          # SessionStart runner
  run-modules/
    PreToolUse/*.js            # gate modules — block or allow tool calls
    PostToolUse/*.js           # observation modules — check tool results
    Stop/*.js                  # stop-control modules — block/allow stopping
    SessionStart/*.js          # context modules — inject text at session start
```

## Setup

Run the setup wizard to migrate from standalone hooks to hook-runner:

```
/hook-runner setup         # full wizard: scan → report → backup → install → verify
/hook-runner report        # just see what hooks you have (HTML report)
/hook-runner dry-run       # preview changes without modifying anything
```

## Module Sync (new PC setup)

Pull modules from GitHub using a config file:

```
# 1. Install hook-runner (setup wizard installs runners + creates dirs)
/hook-runner setup

# 2. Create your module config (or copy from another machine)
#    Edit ~/.claude/hooks/modules.yaml to pick which modules you want

# 3. Sync modules from GitHub
/hook-runner sync          # install/update modules per config
/hook-runner sync-dry-run  # preview what would change
```

Config format (`~/.claude/hooks/modules.yaml`):
```yaml
source: grobomo/hook-runner   # GitHub repo with modules/ directory
branch: main
modules:
  PreToolUse:
    - enforcement-gate        # git repo + clean tree + TODO.md
    - branch-pr-gate          # Model C branching workflow
    - root-cause-gate         # blocks cleanup without diagnosis
  Stop:
    - auto-continue           # never stop, find next task
```

See `modules.example.yaml` in the repo for the full list of available modules.

## Module Contract

```javascript
// run-modules/<Event>/my-module.js
module.exports = function(input) {
  // input.tool_name, input.tool_input (PreToolUse/PostToolUse)
  // input.session_id, input.stop_hook_active (Stop)
  if (shouldBlock) {
    return { decision: "block", reason: "Why it's blocked" };
  }
  return null; // allow
};
```

- Modules MUST be synchronous (no async/await)
- Use `require()` not `import`
- Return `null` to pass, `{decision: "block", reason: "..."}` to block
- Modules run alphabetically — prefix with `01-` for ordering
- First block wins — remaining modules are skipped

## Project-Scoped Modules

Put modules in a subfolder named after your project:

```
run-modules/PreToolUse/
  my-global-gate.js           # runs for ALL projects
  my-project/
    project-specific-gate.js  # runs ONLY when CLAUDE_PROJECT_DIR basename = "my-project"
```

## Adding Behavior

1. Create `~/.claude/hooks/run-modules/<Event>/your-module.js`
2. Export a sync function matching the contract above
3. Never add entries to settings.json — runners are already registered
