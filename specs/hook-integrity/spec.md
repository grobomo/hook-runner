# Spec: Hook Integrity Monitor

## WHY
Three problems hit in the same week:

1. A background process silently overwrote live hook modules, stripping WORKFLOW
   tags from 37 modules. Nobody noticed until the test suite caught it.
2. A test suite ran `--workflow disable shtd --global`, silently breaking enforcement
   for ALL sessions. Discovered hours later by chance.
3. A new project started without SHTD active — Claude wrote unspecced code for 45
   minutes before anyone noticed.

Hook-runner is security software. If any process can silently disable it, bypass
workflows, or corrupt modules, the entire system is unreliable. Every Claude
session on this machine must follow globally enforced workflows. No exceptions
by default. Ever.

## Problem
1. No integrity check verifies live modules match the repo catalog
2. Direct edits to `~/.claude/hooks/run-modules/` go undetected
3. Globally enforced workflows (SHTD) can be silently disabled per-project
4. New projects start with no workflow state — unspecced work happens
5. No cross-session monitoring — each session is an island
6. No audit trail of when/why enforcement was bypassed

## Solution: Hook Integrity Monitor

### Design Principles
- **Repo is source of truth** — `modules/` in the hook-runner repo
- **Global enforcement is absolute** — if SHTD is globally enabled, EVERY project
  must follow it. No project-level disable. No silent opt-out.
- **Auto-repair over alerting** — when drift detected, fix it immediately
- **Exceptions require explicit user approval** — stored in a whitelist file,
  never auto-generated
- **Defense in depth** — SessionStart checks, PreToolUse gates, UserPromptSubmit
  monitors, and scheduled watchdog all enforce independently

### Components

#### 1. SessionStart module: `hook-integrity-check.js`
- Verify live modules match repo (checksums). Auto-repair drift.
- Verify globally enforced workflows are active in current project.
  If SHTD is globally enabled but no workflow state exists for this project,
  auto-activate it.
- Check for disabled-at-project-level overrides of global workflows — block
  unless project is in explicit exception whitelist.
- Report drift count + workflow activation in session start output.

#### 2. PreToolUse gate: `workflow-compliance-gate.js`
- On every tool call, verify the current project's workflow state matches
  global enforcement requirements.
- If a globally enforced workflow (e.g. SHTD) is not active: BLOCK.
- Cannot be bypassed by editing workflow-config.json — checks the global
  config directly, not cached state.
- Exception whitelist: `~/.claude/hooks/workflow-exceptions.json`
  Format: `{"<project-dir>": {"workflow": "shtd", "reason": "...", "approved_by": "user", "date": "..."}}`
  Must be manually created — no CLI command to add exceptions.

#### 3. UserPromptSubmit module: `hook-integrity-monitor.js` (async)
- Spot-check random sample of live modules vs repo each prompt
- Rate-limited: skip if last check <60s ago
- On drift: full scan + auto-repair + log
- Never blocks prompts (async)

#### 4. Watchdog enhancement (existing watchdog.js)
- Add check: scan all known project dirs for workflow compliance
- Known projects: read from `~/.claude/projects/` directory listing
- For each project: verify globally enforced workflows have active state
- On violation: write `.watchdog-alert` for SessionStart to surface

#### 5. Repo path marker
- `sync-live` writes `~/.claude/hooks/.hook-runner-repo` with repo absolute path
- All integrity modules use this to find the source-of-truth repo
- If marker missing: SessionStart warns, modules skip integrity checks

### File integrity checks
- Every `.js` in repo `modules/<event>/` must match live `run-modules/<event>/`
- Content must be byte-identical (prevents tag stripping, code injection)
- Live orphans (files not in repo) are logged as warnings
- Runner files (run-*.js, load-modules.js, etc.) must match repo
- Project-scoped subdirs in live that don't exist in repo are allowed
  (they're the correct override mechanism)

### Workflow compliance checks
- Read `~/.claude/hooks/workflow-config.json` for globally enabled workflows
- For each globally enabled workflow: verify `.workflow-state.json` exists
  in current project dir with that workflow active
- If missing: auto-activate (not block — be helpful)
- If explicitly disabled at project level: BLOCK unless in exception whitelist
- Exception whitelist is manual-only — no automation creates exceptions

### What it does NOT do
- Does not sync live→repo (that's manual, intentional, reviewed)
- Does not auto-create exception whitelist entries
- Does not touch project-scoped subdirs that only exist in live
- Does not monitor non-Claude processes (only hooks context)

### Edge cases
- New project with no `.workflow-state.json` → auto-activate globally enforced workflows
- Project in exception whitelist → skip workflow compliance for that workflow
- Repo marker file missing → skip file integrity checks, still enforce workflow compliance
- `workflow-config.json` missing → skip workflow compliance (no enforcement configured)
- Multiple Claude sessions editing same file → repo wins, last sync-live wins
