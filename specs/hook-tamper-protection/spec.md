# Spec: Hook Tamper Protection

## Problem
Claude Code sessions can silently weaken their own enforcement hooks. Confirmed incident: spec-gate.js was edited to only gate Edit/Write tools, removing Bash gating. This means any session can bypass SHTD by running code through Bash instead of Edit. The session that did this left no audit trail — we only discovered it when enforcement stopped working.

Additional issues discovered:
1. **Session isolation** — hook state files (e.g. instruction-pending flags) in %TEMP% are shared across all Claude tabs, causing cross-session false positives
2. **TODO.md fallback too broad** — any unchecked task in TODO.md lets any file be edited, even for unrelated work
3. **No tamper detection** — if a session weakens a hook, there's no alert, no diff review, no rollback

## Root Cause
`hook-editing-gate.js` exists but only checks that the edit targets a hook file — it doesn't verify the edit doesn't weaken enforcement. A session can claim it's "fixing" a hook while actually removing blocks.

## Solution

### 1. Hook Edit Auditing (T339)
Every edit to `~/.claude/hooks/run-modules/**` must:
- Append a tamper log entry to `~/.system-monitor/hook-audit.jsonl` (outside hooks dir, append-only)
- Entry includes: timestamp, session PID, file path, before hash, after hash, diff summary
- Self-reflection reviews hook edits at Stop events — flags enforcement weakening patterns

### 2. Enforcement Weakening Detection (T339)
Before allowing a hook edit, scan the diff for weakening patterns:
- Removing `tool_name` checks (broadening what's allowed)
- Adding early `return null` (bypassing all checks)
- Removing `decision: "block"` return statements
- Changing `===` to `!==` on tool name checks
- Narrowing the tools gated (e.g. removing "Bash" from the check list)

If weakening detected: block the edit and require user confirmation with an explanation of what changed.

### 3. spec-gate.js Restoration (T338)
Restore Bash gating. When spec chain is not satisfied:
- Block `cargo build`, `cargo run`, `cargo test` (Rust)
- Block `npm run`, `npm test`, `node src/` (JS)
- Block `python src/`, `pytest` (Python)
- Block `nohup`, process launch commands
- Allow: git, ls, cat, grep, read-only commands (needed for exploration)
- Allow: running existing test scripts (`bash scripts/test/`)

### 4. Session-Scoped State Files (T337)
Replace shared temp files with session-scoped ones:
- Include `CLAUDE_SESSION_ID` or parent PID in flag filenames
- Each tab gets independent state
- Cleanup stale flags on session start

### 5. Task-Scoped TODO.md Fallback (T340)
When using TODO.md as the task source (no matching spec):
- Require Claude to declare which task ID it's working on (via a state file)
- Only allow edits to files plausibly related to that task
- On main branch with no declared task: block code edits entirely

## Non-goals
- Not replacing hook-runner with a different system
- Not requiring all hooks to be in a separate repo (too much friction)
- Not blocking hook edits entirely (self-repair is valuable, just needs guardrails)

## Priority
T338 (restore spec-gate Bash blocking) is highest — it's an active enforcement gap.
T339 (audit + weakening detection) prevents recurrence.
T337 and T340 are quality-of-life improvements.
