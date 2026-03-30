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

## Project-Scoped Modules

Modules in a subfolder matching your project name only run for that project:

```
run-modules/PreToolUse/
  global-gate.js              # runs for ALL projects
  my-project/
    custom-gate.js            # runs ONLY when CLAUDE_PROJECT_DIR basename = "my-project"
```

## Example Modules

See `run-modules/` for included examples:
- `PreToolUse/enforcement-gate.js` — requires git repo + clean tree + TODO.md
- `PreToolUse/root-cause-gate.js` — blocks workarounds, demands root cause analysis
- `PostToolUse/rule-hygiene.js` — validates rule files are granular
- `Stop/auto-continue.js` — keeps Claude working instead of stopping to ask
- `SessionStart/load-instructions.js` — injects working instructions at session start
