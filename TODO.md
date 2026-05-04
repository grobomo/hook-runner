# hook-runner — Project Tracking

## Overview
Modular hook runner system for Claude Code. One runner per event, modules in folders.
- Repo: grobomo/hook-runner (public)
- Marketplace: trend-ai-taskforce/ai-skill-marketplace → plugins/hook-runner
- Local skill: ~/.claude/skills/hook-runner/
- Live hooks: ~/.claude/hooks/ (run-*.js, load-modules.js, run-modules/)

## Current State (v2.78.0)
- 122 modules, 7 workflows, 191 test suites, ~2832 tests
- PRs: 529 merged

## Open Tasks
- [x] T612: Create GETTING-STARTED.md — 5-minute onboarding guide. Linked from README. (PR #518)
- [x] T611: Fix onboarding UX — setup.js workflow name dynamic, README module counts updated, --diagnose added to docs. (PR #517)
- [x] T610: Add tests for 5 untested PreToolUse modules — force-push-gate (14), commit-quality-gate (21), no-hardcoded-paths (19), no-polling-gate (30), no-rules-gate (14). 98 new tests. (PR #515)
- [x] T610b: Tests for all remaining untested modules. Batch 2 (PR #520, 6 modules/101 tests), batch 3 (PR #521, 5 modules/65 tests), batch 4 (PR #522, 2 modules/33 tests), batch 5 (PR #523, 7 modules/136 tests). All modules now have test coverage.
- [x] T609: Fix worktree-gate test env leak + spec-gate control structure allow. 16/16 worktree + 79 spec-gate tests. (PR #514)
- [x] T608: Fix _bash-write-patterns.js false positive — echo/printf/cat redirect patterns matched across statement boundaries and on stderr redirects. Fixed with `[^;|&]*` + `(?<![0-9])` lookbehind. 63 tests (12 new). (PR #512)
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
- [ ] (deferred) Port remaining OpenClaw modules (configurable/niche: aws-tagging, deploy-gate, messaging-safety, etc.)

## Session Handoff (2026-05-04, session 13)
- T615 (PR #527): `--list --why` flag shows `// WHY:` descriptions inline in module catalog. 11 tests.
- T616 (PR #528): Fixed windowless-spawn-gate test env leak — gate checks HOOK_RUNNER_TEST, test now saves/clears it. 32/32 pass.
- T617 (PR #529): v2.78.0 version bump, changelog, GitHub release.
- v2.78.0. 122 modules, 191 suites, ~2832 tests, 529 PRs.
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
