# Tasks: Hook Tamper Protection

## T338: Restore spec-gate Bash blocking
- Audit: scan jsonl logs and git history to find when/why Bash gating was removed
- Add Bash to the gated tools list in spec-gate.js
- Define allowlist of read-only/exploration Bash commands that don't need spec chain
- Block build/run/test commands (cargo, npm, python, nohup, etc.) when spec chain unsatisfied
- Test: verify cargo build is blocked on main with no open spec tasks

## T339: Hook edit auditing and weakening detection
- Create hook-audit.jsonl writer — append entry on every Edit/Write to run-modules/
- Implement weakening pattern scanner (removed blocks, added return null, narrowed tool checks)
- Integrate into hook-editing-gate.js — block + require user confirmation if weakening detected
- Add audit log reader to hook-runner report (show recent hook modifications)
- Test: simulate a weakening edit, verify it's blocked

## T337: Session-scoped state files
- Identify all temp flag files used by hook modules (instruction-pending, workflow-state, etc.)
- Add session ID derivation (CLAUDE_SESSION_ID env var, or fall back to ppid)
- Update all modules to use session-scoped filenames
- Add stale flag cleanup to SessionStart
- Test: verify two tabs don't interfere with each other's flags

## T340: Task-scoped TODO.md fallback
- [x] On main branch in projects WITH specs/, require a feature branch (TODO.md alone too permissive)
- [x] Projects without specs/ keep the simple TODO.md fallback (backwards compatible)
- [x] Feature branches have T321 enforcement (task ID must match unchecked task)
- [x] Test: T106 test 7 — main + specs + TODO.md blocks, feature branch passes
- ~~Add task declaration mechanism~~ — simplified: feature branch requirement is sufficient
