# Hook Runner

**Hook Runner:** `grobomo/hook-runner` (public) — the engine. Install to `~/.claude/hooks/`.
**SHTD Workflow:** `grobomo/shtd-workflow` (public) — workflow modules that plug into hook-runner.
**This install:** Hook-runner + SHTD. Changes go to the appropriate grobomo repo via SHTD flow.

Modular hook system for Claude Code. One runner per event, modules auto-loaded.

## Architecture

```
~/.claude/hooks/
  load-modules.js          # shared loader (global + project-scoped)
  run-pretooluse.js        # PreToolUse runner
  run-posttooluse.js       # PostToolUse runner
  run-stop.js              # Stop runner
  run-sessionstart.js      # SessionStart runner
  run-modules/
    PreToolUse/
      *.js                 # global modules (all projects)
      hackathon26/*.js     # only for hackathon26 project
    PostToolUse/
      *.js
    Stop/
      *.js
    SessionStart/
      *.js
```

## Design Decisions

### Shared `load-modules.js`
All four runners delegate module discovery to `load-modules.js`. This avoids duplicating the global+project logic in each runner. Runners only differ in how they interpret module results (block/allow vs text output).

### Project Scoping by Basename
Project-scoped modules live in subfolders named after `path.basename(CLAUDE_PROJECT_DIR)`. Basename was chosen over full path because:
- Folder names are short and readable (`hackathon26`, not `C-Users-joelg-Documents-...`)
- Projects don't move between machines with different base paths
- Collisions are unlikely — project names are already unique within ProjectsCL1

### Load Order: Global First, Then Project
Global modules run first (sorted alphabetically), then project-scoped modules (also sorted). This means project modules can add extra gates but can't override a global block — once any module returns a decision, the runner stops. If a project needs to *skip* a global gate, move that gate out of global into the projects that need it.

### Modules Are Synchronous
All modules export a synchronous function. They read stdin via `fs.readFileSync(0)` in the runner, which passes the parsed input object. Async hooks race with the timeout and silently fail.

## Adding a Module

1. **Global** (all projects): create `run-modules/{Event}/my-gate.js`
2. **Project-scoped**: create `run-modules/{Event}/<project-name>/my-gate.js`
3. Module signature: `module.exports = function(input) { return null; }` (null = allow, `{decision: "block", reason: "..."}` = block)
4. Never add entries to `settings.json` — runners are already registered there.
