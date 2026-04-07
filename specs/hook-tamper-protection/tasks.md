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
- Add task declaration mechanism (write current task ID to .system-monitor/active-task.json)
- spec-gate reads active task and only allows edits plausibly related to it
- On main branch with no declared task: block all code edits
- Self-reflection updates active task based on conversation context
- Test: verify editing unrelated files is blocked when on main with a declared task
