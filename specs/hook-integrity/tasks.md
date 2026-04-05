# Tasks: Hook Integrity Monitor

## Critical — Workflow Compliance Gate (do first)
- [ ] T298: Create `workflow-compliance-gate.js` PreToolUse module — blocks ALL tool calls if globally enforced workflow (SHTD) is not active in current project. Auto-activates on first encounter. Logs every check (pass/block) to hook-log. Exception whitelist via manual `workflow-exceptions.json` only.
- [ ] T299: Create `hook-integrity-check.js` SessionStart module — verify live modules match repo checksums, auto-repair drift, auto-activate globally enforced workflows, log all activity (drift count, repairs, workflow activations) to hook-log + session output.

## Mid-Session Monitoring
- [ ] T300: Create `hook-integrity-monitor.js` UserPromptSubmit module (async) — spot-check random sample of live modules vs repo each prompt, rate-limited 60s, full scan + auto-repair on drift, log all checks (clean/drifted/repaired) to hook-log.

## CLI & Reporting
- [ ] T301: Add `--integrity` CLI command — full scan with verbose output, shows all drifted files, workflow compliance status per known project, repair status, exception list. Machine-readable JSON option.

## Testing
- [ ] T302: Test suite for hook-integrity — mock repo/live dirs, verify drift detection, auto-repair, workflow compliance gate (block/allow/exception), logging, rate limiting, edge cases

## Docs & Release
- [ ] T303: Update README (Available Modules table + integrity section), CLAUDE.md, TODO.md
- [ ] T304: Version bump + CHANGELOG + sync live + marketplace
