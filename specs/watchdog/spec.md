# Spec: Hook System Watchdog

## WHY
A test suite ran `--workflow disable shtd --global` as cleanup, silently disabling
auto-continue, branch-pr-gate, and 38 other modules for ALL Claude Code sessions.
The user only discovered it by chance hours later. Hooks can't monitor themselves —
they only fire during active sessions with user interaction. Autonomous sessions
running for hours with no user prompts have zero self-monitoring.

## Problem
No independent health monitor exists. Changes to workflow-config.json, deleted
runner files, corrupted settings.json, or removed modules go undetected until a
human manually notices. This is a critical gap for unsupervised operation.

## Solution: Scheduled watchdog

### What it monitors
1. **Workflow config** — required workflows are enabled in workflow-config.json
2. **Runner files** — all run-*.js + load-modules.js + workflow.js exist
3. **Settings.json** — hook entries reference existing scripts
4. **Critical modules** — auto-continue, branch-pr-gate, etc. exist and export functions
5. **Config integrity** — workflow-config.json is valid JSON, not all-false

### How it works
- `watchdog.js` — standalone Node.js, zero deps, cross-platform
- Reads `watchdog-config.json` declaring what "healthy" looks like
- Runs checks, outputs JSON results to stdout
- On failure: auto-repairs (re-enables disabled workflows)
- On failure: writes `.watchdog-alert` flag for SessionStart to read
- Logs to `watchdog-log.jsonl`
- Exit 0 = healthy, 1 = repaired, 2 = broken

### watchdog-config.json format
```json
{
  "required_workflows": ["shtd"],
  "required_runners": ["run-pretooluse.js", "run-posttooluse.js", "run-stop.js", "run-sessionstart.js", "run-userpromptsubmit.js"],
  "required_modules": ["Stop/auto-continue.js", "PreToolUse/branch-pr-gate.js"],
  "hooks_dir": "~/.claude/hooks"
}
```

### Scheduling
- OS scheduler: schtasks (Windows), launchd (macOS), cron (Linux)
- Every 10 minutes
- No window flash (VBS wrapper on Windows)
- `node watchdog.js --install` registers the scheduled task
- `node watchdog.js --uninstall` removes it

### SessionStart integration
- Existing project-health module reads `.watchdog-alert`
- Injects warning: "WATCHDOG: shtd was disabled, auto-repaired at <time>"
- Claude sees this and knows the system had an issue

### Also fixes T205 test
- The test that caused this bug gets fixed to not touch global config

## Success criteria
- `node watchdog.js` exits 0 on healthy system
- Disabling shtd → watchdog detects, repairs, logs, alerts within 10 min
- `node watchdog.js --install` works on Windows + Linux
- `node watchdog.js --uninstall` cleanly removes scheduled task
- T205 test no longer sabotages global workflow config
