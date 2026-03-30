# Setup Wizard — Plan

## Architecture
Single `setup.js` script in the skill directory. No dependencies beyond Node.js stdlib.

## Components

### 1. Hook Scanner
- Read `~/.claude/settings.json` hooks section
- For each hook entry, resolve the command path and check if the script exists
- Categorize: event type, matcher, command path, file exists/missing

### 2. Report Generator
- Generate a styled HTML report (same aesthetic as the hooks-report.html)
- Show: event flow diagram, hook count stats, per-event details with matchers
- Open in default browser

### 3. Preview Generator
- Show what hook-runner would install:
  - 4 runner scripts (run-pretooluse.js, run-posttooluse.js, run-stop.js, run-sessionstart.js)
  - load-modules.js shared loader
  - run-modules/ directory structure
  - settings.json hook entries (one per event+matcher combo)

### 4. Backup Engine
- Create timestamped dir in ~/.claude/hooks/archive/
- Copy all existing hook scripts referenced in settings.json
- Copy settings.json hooks section as hooks-backup.json
- Write manifest.json listing all backed-up files

### 5. Installer
- Copy runner scripts to ~/.claude/hooks/
- Copy load-modules.js to ~/.claude/hooks/
- Create run-modules/{PreToolUse,PostToolUse,Stop,SessionStart}/ dirs
- Update settings.json hooks to point to runners
- Preserve existing matchers

### 6. Verification
- Re-run report generator on the new config
- Display archive path
- Display summary of changes

## File Layout
```
~/.claude/skills/hook-runner/
  SKILL.md          — skill metadata + usage instructions
  setup.js          — the wizard script
  lib/
    scanner.js      — hook scanner
    report.js       — HTML report generator
    backup.js       — backup engine
    installer.js    — installs runner system
```
