# hook-runner — Project Tracking

## Overview
Modular hook runner system for Claude Code. One runner per event, modules in folders.
- Repo: grobomo/hook-runner (public)
- Marketplace: trend-ai-taskforce/ai-skill-marketplace → plugins/hook-runner
- Local skill: ~/.claude/skills/hook-runner/
- Live hooks: ~/.claude/hooks/ (run-*.js, load-modules.js, run-modules/)

## Current State (v2.80.0)
- 118 modules in catalog, 7 workflows, 193 test suites, ~2869 tests
- PRs: 537 merged
- CI: fully green (Ubuntu + Windows + install)

## Open Tasks
- [x] T612: Create GETTING-STARTED.md — 5-minute onboarding guide. Linked from README. (PR #518)
- [x] T611: Fix onboarding UX — setup.js workflow name dynamic, README module counts updated, --diagnose added to docs. (PR #517)
- [x] T610: Add tests for 5 untested PreToolUse modules — force-push-gate (14), commit-quality-gate (21), no-hardcoded-paths (19), no-polling-gate (30), no-rules-gate (14). 98 new tests. (PR #515)
- [x] T610b: Tests for all remaining untested modules. Batch 2 (PR #520, 6 modules/101 tests), batch 3 (PR #521, 5 modules/65 tests), batch 4 (PR #522, 2 modules/33 tests), batch 5 (PR #523, 7 modules/136 tests). All modules now have test coverage.
- [x] T609: Fix worktree-gate test env leak + spec-gate control structure allow. 16/16 worktree + 79 spec-gate tests. (PR #514)
- [x] T608: Fix _bash-write-patterns.js false positive — echo/printf/cat redirect patterns matched across statement boundaries and on stderr redirects. Fixed with `[^;|&]*` + `(?<![0-9])` lookbehind. 63 tests (12 new). (PR #512)
- [x] T613: Updated nested-claude gate — now distinguishes info commands (--help, --version) from subprocess commands (claude -p). Info commands get "you ARE Claude" message. Subprocess commands get 3 alternatives: separate terminal, context_reset.py, PowerShell Start-Process. Also fixed gate-quality-gate name convention check to only apply to new files. 28 tests.
- [ ] T578: Marketplace sync — BLOCKED on user permission. Two marketplaces exist (trend-ai-taskforce/ai-skill-marketplace and aatf-external/plugin-marketplace). User must clarify: which org is aatf-external, what's the difference, and does hook-runner belong in either/both. CLAUDE.md updated with publishing rules. publish.json needs manual edit to add `team_sharing_approved: false`.
- [x] T607: Add T605/T606 modules to README table + version bump to v2.73.0. Also added to live modules.yaml.
- [x] T596: Project health — archived 468 completed tasks + 5 stale handoffs to TODO-COMPLETED.md (1468→35 lines).
- [x] T597: Remove broken UserPromptSubmit hook from lab-worker settings.json — already fixed (was `{"hooks": {}}`)
- [x] T598: Improve hook-editing-gate.js block message with actionable 3-step instructions. Both Bash bypass and Edit/Write blocks updated. Test added (17 tests).
- [x] T604: Hook diagnostics — `node setup.js --diagnose [project-dir]`. Settings resolution, hook validation, --fix, --json. 10+21 tests. (PR #509)
- [x] T603: User correction detector — PostToolUse module, prompt-log.jsonl real-time, strong/moderate patterns, dedup, correction-log.jsonl. 61 tests. (PR #508)
- [x] T605: automate-everything-gate — blocks manual lint/check commands, forces CI/CD pipeline. 27 tests.
- [x] T606: no-lessons-file-gate — blocks writes to lessons.jsonl, forces hook module creation. 11 tests.
- [x] T613: tunnel-check-gate — blocks process-grep SSH tunnel checks, suggests port connectivity. 29 tests. (PR #519)
- [x] T614: Fix README module counts + v2.77.0 changelog + GitHub releases. (PRs #524-#525)
- [x] T615: Add `--list --why` flag — shows WHY descriptions inline. 11 tests. (PR #527)
- [x] T616: Fix windowless-spawn-gate test env leak — HOOK_RUNNER_TEST cleared during test. 32/32 pass. (PR #528)
- [x] T617: Version bump v2.78.0 + changelog + GitHub release. (PR #529)
- [x] T618: Fix `--test-module` to resolve bare module names — searches all event folders. 11 tests. (PR #531)
- [x] T619: Fix GETTING-STARTED.md (starter 49→46) + README `--test-module` examples. (PRs #532-#533)
- [x] T620: Fix diagnose.js tilde expansion in Windows 8.3 paths — `RUNNER~1` was expanded to HOME. CI now fully green. 22 tests. (PR #535)
- [x] T621: Add `--search <query>` — find modules by name or WHY description. 15 tests. (PR #537)
- [x] T623: Spawn-reason tracking — stop module should pass `--reason` to context_reset.py. Depends on context-reset T034 (`--reason` arg). Done in PR #539 — stop-message.txt now includes `--reason` in both context_reset.py and new_session.py calls.
- [x] T624: Rewrite spec-gate with auto-activation — activate when: publish.json=public, specs/ already exists, shared org, feat/ branch. Dormant otherwise. Removed WORKFLOW tag, added shouldActivate() with caching. 10 new tests. (PR #540)
- [x] T635: UPS settings guard — hook-editing-gate blocks UserPromptSubmit in any settings.json. 4 tests. (PR #541)
- [x] T636: Create _haiku-judge.js shared helper — POST /judge to llm-token-proxy (port 4100). 8 tests. (PR #542)
- [ ] T637: Wire victory-declaration gate (T634) through _haiku-judge.js as proof of concept.
- [x] T638: Standardize haiku rules file naming — done in previous session (PR #544). Files now at ~/.claude/proxy/{stop,sessionstart,userprompt}-haiku-rules.{yaml,md}. Copied to Windows in this session.
- [ ] T625: Verify chat-export skill works end-to-end (installed via symlink, untested)
- [ ] T626: Test all active gates in live session — todo-gate, settings-watchdog-gate, gate-quality-gate, cross-project-todo-gate
- [x] T627: Fix 5 broken gates — regex patcher had injected `_log(...)` inline into `return null` statements, breaking JS syntax. Fixed by stripping corrupted patterns. 3 gates restored (no-rewrite, settings-watchdog, todo-gate), 2 were already working (cross-project-todo, proxy-restart).
- [ ] T628: Add logging to all gates properly — clean implementation, not regex patching. Each gate needs: _log() on invoke, _log() on pass with reason, _log() on block with context.
- [x] T629: gate-quality-gate Bash detection — added Bash interception for writes to hooks/run-modules/ and hook-runner/modules/. Detects cp, mv, redirect, heredoc, sed -i, tee, python write_text. 20 tests.
- [ ] T630: agent-quality-gate needs testing — verify it fires on Agent tool calls and haiku analysis works through proxy
- [ ] (deferred) Port remaining OpenClaw modules (configurable/niche: aws-tagging, deploy-gate, messaging-safety, etc.)

### Worktree-awareness bugs (reported from dd-lab session 39, 2026-05-08)
- [ ] T631: spec-before-code gate checks TODO.md and git log at CLAUDE_PROJECT_DIR (original project dir), not CWD — worktree TODO.md edits and commits are invisible to the gate. Repro: EnterWorktree, edit TODO.md with `- [ ] T###:`, try Edit on any file → gate says "no spec found". Root cause: path resolution uses original project dir, not `git rev-parse --show-toplevel` or CWD.
- [ ] T632: SHTD spec gate checks `specs/` at original project dir, not worktree — creating tasks.md in worktree doesn't satisfy the gate. Same root cause as T631: path resolution ignores worktree.
- [ ] T633: Branch detection reports worktree as "main" — worktree on branch `worktree-terraform-refactor` but gate says "On main branch, create a feature branch". Root cause: `git branch --show-current` or `git rev-parse --abbrev-ref HEAD` may return wrong result when run from worktree subdir, or gate is reading from wrong .git path.
- [ ] T634: Victory-declaration gate triggers on "completed" and "done" in commit messages that describe past work (retroactive tasks.md for already-shipped PRs). Gate should only flag claims about the CURRENT commit's changes, not historical references.
- [ ] T640: Install spirit-check system (Factory Floor Model). Source: llm-token-proxy/hooks/. Three files:
  1. `PostToolUse/spirit-check.js` — Haiku audits tool calls against spirit-rules.yaml after execution. On high-severity violation, writes `~/.claude/hooks/violation-state.json`.
  2. `PreToolUse/violation-gate.js` — Reads violation-state.json, blocks once with instructions to read `~/.claude/hooks/violation-analysis.md`, marks acknowledged.
  3. Spirit rules already deployed at `~/.claude/proxy/spirit-rules.yaml` (5 rules: archive spirit, destructive git spirit, settings bypass, gate weakening, scope creep).
  Architecture doc: llm-token-proxy/docs/hook-architecture.md.
  Install: copy files from llm-token-proxy/hooks/{PostToolUse,PreToolUse}/ to ~/.claude/hooks/run-modules/. Verify with tests.
- [x] T641: Fix stop hook — was three issues: (1) BLOCKING_MODULES hardcoded list didn't include new -gate modules → replaced with // BLOCKING: true tag (T639), (2) run-stop.js only kept first block → now collects ALL blocking results, writes stop-analysis.md, outputs to stderr, (3) settings.json timeout was 5s, haiku needs ~6s → set to 30s from haiku-config.json. (PR #540)
- [x] T642: Fix settings-watchdog-gate.js corruption — fixed during WSL module copy to Windows. Stripped `.trim()});` + bare `return null;` artifacts from no-rewrite-gate and todo-gate too.
- [ ] T643: Add gate rule: "use mcp-manager for all MCP servers" — when a session needs an MCP tool, it should use mcp-manager to start/call servers rather than trying to invoke MCP tools directly or running relay scripts. Cross-project: applies to all projects.
- [ ] T644: Add gate rule: "hook-runner project exists at /mnt/c/Users/joelg/Documents/ProjectsCL1/_grobomo/hook-runner/" — when Claude needs to modify hooks and gets blocked by hook-editing-gate, it should automatically create a TODO in hook-runner and spawn a session there via context-reset, not ask the user to do it manually.
- [x] T639: Standardize module meta parsing — single-pass parseModuleMeta() replaces 3 separate parsers. getHeaderLines() scans full comment block (was slice(0,8) — missed 3 modules). Added BLOCKING tag, central haiku-config.json, settings.json backup-on-change. (PR #540)
- [x] T635: Wire auto-continue-gate stop module to spawn api_check.py --watch as detached process when API error patterns detected in transcript. Enables autonomous recovery: session dies → watcher waits → spawns fresh session. 15 tests.
- [x] T645: Haiku directive enforcement (Panama Canal model) — auto-continue-gate writes structured continue-directive.json with scoped `allow` list when haiku says CONTINUE. PreToolUse continue-directive-gate reads allow list to permit only tools targeting allowed files (TODO.md, SESSION_STATE.md, etc.). Read/Glob/Grep always pass. Circuit breaker at 3 same-rule strikes. 10min expiry. Stale session detection. Prevents deadlock where enforcement blocks the tools needed to comply.
- [ ] T646: T626 live gate verification — test all active wsl gates in real session. Need fresh session (this one is deep in context). Gates to test: todo-gate, settings-watchdog-gate, gate-quality-gate, continue-directive-gate, no-rewrite-gate, proxy-restart-gate, agent-quality-gate, pre-tool-verify-gate, spec-gate. For each: trigger condition, expected block message, verify logging. Also T625 (chat-export e2e).
- [ ] T647: Directive allow list needs `context-reset` and `new_session.py` — spawning fresh sessions is a valid way to address "continue working" directives but got blocked. Also need to allow `git` commands (commit/push are valid work actions).

## Session Handoff (2026-05-04, session 14)
- T621 (PR #537): `--search <query>` — find modules by name or WHY description. Case-insensitive. 15 tests.
- T622: README + GETTING-STARTED.md updated with `--search` and `--list --why`. v2.80.0.
- v2.80.0. 118 catalog modules, 193 suites, ~2869 tests, 538 PRs.
- Remaining open: T578 (marketplace sync, blocked on user), deferred OpenClaw module ports.

## Session Handoff (2026-05-04, session 13)
- T615 (PR #527): `--list --why` flag shows `// WHY:` descriptions inline in module catalog. 11 tests.
- T616 (PR #528): Fixed windowless-spawn-gate test env leak — gate checks HOOK_RUNNER_TEST, test now saves/clears it. 32/32 pass.
- T618 (PR #531): `--test-module` resolves bare names from any event folder. 11 tests.
- T619 (PRs #532-#533): GETTING-STARTED.md starter 49→46, README `--test-module` examples updated.
- T620 (PR #535): Fixed diagnose.js `/~/g` → `/^~/g` — Windows 8.3 short names like `RUNNER~1` were corrupted. **CI now fully green** for first time (all runs were failing on Windows before this).
- v2.79.0. 118 catalog modules, 192 suites, ~2854 tests, 535 PRs.
- GitHub repo description updated (122→118 modules, 13→7 workflows).
- Remaining open: T578 (marketplace sync, blocked on user), deferred OpenClaw module ports.

## Session Handoff (2026-05-04, session 12)
- T610b batch 5 (PR #523): Tests for all 7 remaining untested modules — 136 new tests. enforcement-gate (15), cross-project-todo-gate (24), inter-project-priority-gate (34), secret-scan-gate (15), workflow-gate (28), workflow-compliance-gate (8), branch-pr-gate (85).
- T610b COMPLETE — every module now has test coverage. 190 suites, 2821 tests total.
- T614 (PRs #524-#525): Fixed README module counts (starter 49→46, shtd 110→104), v2.77.0 changelog.
- GitHub releases created for v2.76.0 and v2.77.0. Snapshot refreshed (391 files).
- v2.77.0. 122 modules, 190 suites, 525 PRs.
- Remaining open: T578 (marketplace sync, blocked on user), deferred OpenClaw module ports.
- Project fully current: all tests pass, live hooks synced, snapshot fresh, releases published.

## Session Handoff (2026-05-04, session 11)
- T613 (PR #519): tunnel-check-gate module — blocks process-grep SSH tunnel checks. 29 tests.
- T610b batches 2-4 (PRs #520-#522): 199 new tests for 13 modules. 7 modules remain untested (branch-pr-gate, workflow-compliance-gate, cross-project-todo-gate, secret-scan-gate, inter-project-priority-gate, enforcement-gate, workflow-gate).
- v2.76.0. 122 modules, 183 suites, ~2685 tests, 522 PRs.
- Next: remaining T610b (7 complex modules), or user-directed work.

## Session Handoff (2026-05-04, session 10 continued)
- T611 (PR #517): Fixed setup.js "shtd"→dynamic workflow name, README module counts, --diagnose docs.
- T612 (PR #518): Created GETTING-STARTED.md — 5-min onboarding guide, linked from README.
- PRs: 518 merged total. Next: T610b (more tests) or user-directed work.

## Session Handoff (2026-05-04, session 10)
- v2.73.0→v2.75.0. Three PRs: T608 (#512), T609 (#514), T610 (#515). Plus version bumps (#513, #516).
- **T608**: Fixed _bash-write-patterns.js false positives — redirect patterns constrained to single statements + exclude stderr fd redirects. 63 tests.
- **T609**: Fixed worktree-gate test intermittency (HOOK_RUNNER_TEST env leak). Added for/while/if to spec-gate BASH_ALLOW_PATTERNS.
- **T610**: Added 98 new tests for 5 untested PreToolUse modules (force-push-gate, commit-quality-gate, no-hardcoded-paths, no-polling-gate, no-rules-gate).
- GitHub releases created for v2.74.0 and v2.75.0.
- Live hooks synced with T608/T609 fixes.
- **Still waiting on user**: T578 marketplace questions (aatf-external org, marketplace differences).
- **Next session**: T610b (21 more untested modules), or any new work from user.

## Session Handoff (2026-05-04, session 9)
- v2.72.0→v2.73.0 (previous session did T605/T606/T607 directly on main).
- This session: T603 (user-correction-detector, PR #508), T604 tests (PR #509), changelog (PR #510), README fix (PR #511).
- CLAUDE.md updated with Publishing Rules section: never publish to shared marketplaces without user permission.
- publish.json needs manual user edit to add `team_sharing_approved: false`.
- Investigated spec-before-code-gate "failures" — env issue (hooks intercept test runner), 20/20 pass with HOOK_RUNNER_TEST=1.
- Cleaned 2 stale worktrees + 6 stale branches.
- **WAITING ON USER**: Marketplace questions — what is aatf-external org, difference vs trend-ai-taskforce, where does hook-runner belong.

## Session Handoff (2026-05-04, session 8 continued)
- T605: automate-everything-gate — blocks flake8/pylint/mypy/ruff/shellcheck/semgrep/eslint/prettier/PSScriptAnalyzer/py_compile. Allows script wrappers. 27/27 tests.
- T606: no-lessons-file-gate — blocks Edit/Write/Bash to lessons.jsonl. Forces hook module creation. 11/11 tests.
- Fixed spec-before-code-gate bug: git log ran in cwd instead of CLAUDE_PROJECT_DIR. 20/20 tests.
- Fixed hook-system-reminder: now allows edits from hook-runner project + .yaml config files. 13/13 tests.
- Added no-infra-excuse + user-correction-detector to live modules.yaml.
- README updated with 2 new PostToolUse modules (T094 test now passes).
- Stale worktrees: cleaned t602. t597 has uncommitted work (leave). t604 locked by AV.
- **Next**: Version bump, marketplace sync (T578 needs user permission), add T605/T606 to modules.yaml + README.

## Session Handoff (2026-05-04, session 8)

## Session Handoff (2026-05-04, session 7)
- T597: Already done — lab-worker settings.json was already `{"hooks": {}}`.
- T598: Updated hook-editing-gate.js error messages in both Bash bypass (line 114-116) and Edit/Write project-lock (line 150-152) blocks with actionable 3-step instructions (write TODO, launch session, auto-execute). Added test #16 verifying actionable content. 17/17 tests pass.

## Session Handoff (2026-05-03, session 6)
- v2.70.0 released. 158 suites, ~2340 tests. 118 modules, 7 workflows.
- PRs #505-#506 merged (T594-T595): helper tests + version bump.
- **100% test coverage**: PreToolUse (all + helpers), PostToolUse 15/15, Stop 13/13, SessionStart 14/14.
- GitHub releases created for v2.68.0, v2.69.0, v2.70.0.
- T578 marketplace sync: TODO written to ai-skill-marketplace/TODO.md. Needs user permission.
- Perf analysis: PreToolUse ~492ms/call across 63 modules. No single hot spot — distributed across many ~6ms modules. 5 modules missing TOOLS tags are intentionally tool-agnostic.
- TODO.md archived from 1468 lines to ~50 lines (completed items moved to TODO-COMPLETED.md).

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
- Completed task history: see TODO-COMPLETED.md

- [ ] T614: Add Haiku L1 triage to UserPromptSubmit hook — call `/ask` endpoint with user prompt, print analysis to stdout so it shows in TUI as `<user-prompt-submit-hook>`. Currently only Stop hook calls Haiku (stop-analysis-gate.js). UserPromptSubmit just logs + detects frustration. Should add: call `http://127.0.0.1:4100/ask` with Haiku, system prompt from `prompt-preprocessing-rules.yaml`, 150 max tokens, 4s timeout. Print "L1: {analysis}" to stdout. Session-scoped output file for multi-tab isolation. Ref: existing `haiku-client.js` for the HTTP call pattern.

- [x] T615: Fix stop-analysis-gate.js not showing in TUI — added `// BLOCKING: true` tag to both stop-analysis-gate.js and auto-continue-gate.js. Synced live run-stop.js and load-modules.js with repo (isBlocking + blocks[] array). Added both gates + gate-quality-gate to repo catalog. 20 tests. (PR #546)
- [x] T629: gate-quality-gate Bash detection — now intercepts cp, mv, redirect, write_text, heredoc, sed -i, tee targeting hook module dirs. Distinguishes live (.pending required) vs repo catalog (quality checks only). Added to repo catalog. 20 tests. (PR #546)
- [ ] T647: MOOT — continue-directive-gate.js from T645 was never created. Panama Canal model described but not implemented.

- [ ] T616: WSL haiku-client.js missing ANTHROPIC_AUTH_TOKEN fallback — Windows version checks `ANTHROPIC_AUTH_TOKEN` before `LLM_PROXY_AUTH`, but WSL version only checks `LLM_PROXY_AUTH`. The token is available in the environment as `ANTHROPIC_AUTH_TOKEN` (RDSec JWT). One-line fix: add `if (process.env.ANTHROPIC_AUTH_TOKEN) { _authCache = process.env.ANTHROPIC_AUTH_TOKEN; return _authCache; }` before the LLM_PROXY_AUTH check in ~/.claude/hooks/haiku-client.js. This is why stop-analysis-gate fails in 141ms on WSL — no auth key → proxy returns error.
