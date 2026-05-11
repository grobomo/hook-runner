# hook-runner — Project Tracking

## Overview
Modular hook runner system for Claude Code. One runner per event, modules in folders.
- Repo: grobomo/hook-runner (public)
- Marketplace: trend-ai-taskforce/ai-skill-marketplace → plugins/hook-runner
- Local skill: ~/.claude/skills/hook-runner/
- Live hooks: ~/.claude/hooks/ (run-*.js, load-modules.js, run-modules/)

## Current State (v2.85.0)
- 129 modules in catalog, 7 workflows, 202 test suites, ~2691 tests
- PRs: 542 merged (PR #541 squash-merged)
- CI: pre-existing failures (T024, T204, T636, workflow-gate — environment-specific)

## Bugs (dispatched from publishable-audit 2026-05-11)

- [x] T640: **cwd-drift gate blocks new_session.py cross-project dispatch** — Fixed: moved session management script allowlist (`new_session.py`, `context_reset.py`) to early return before path extraction. Both script path and `--project-dir` argument no longer trigger false positives. 14 tests (2 new).

## Event-Driven Observability (from claude-portable specs/event-driven-observability/)

- [x] T655: **PostToolUse async module: tool-event-guard.js** — Emits `tool.used` events to JSONL at `$CLAUDE_EVENT_LOG`. No-op when env var unset. Truncates command at 200 chars. Includes task_id/stage/worker_id from env. Async (returns null). 10MB log rotation. 10 tests.
- [x] T656: **Stop module: status-emitter-guard.js** — Emits `claude.stopped` event to JSONL at `$CLAUDE_EVENT_LOG`. No-op when env var unset. Includes task_id, stage, stop reason, worker_id. 10MB log rotation. 9 tests.

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
- [x] T637: Wire victory-declaration gate through _haiku-judge.js — regex pre-filters, then haiku-judge does semantic check. Fallback to regex-only when judge unavailable. Updated 3 test files for async handling (39 tests total).
- [x] T638: Standardize haiku rules file naming — done in previous session (PR #544). Files now at ~/.claude/proxy/{stop,sessionstart,userprompt}-haiku-rules.{yaml,md}. Copied to Windows in this session.
- [x] T625: Chat-export skill verified end-to-end — export.py parses JSONL (244 turns), generates 554KB self-contained HTML, creates landing page with search.
- [x] T626: Test all active gates in live session — todo-gate, settings-watchdog-gate, gate-quality-gate, cross-project-todo-gate
- [x] T627: Fix 5 broken gates — regex patcher had injected `_log(...)` inline into `return null` statements, breaking JS syntax. Fixed by stripping corrupted patterns. 3 gates restored (no-rewrite, settings-watchdog, todo-gate), 2 were already working (cross-project-todo, proxy-restart).
- [x] T628: Add logging to wsl workflow gates — spec-gate was the only active gate missing logging. Added _log() wrapper with block-tag extraction. 10/11 active wsl PreToolUse gates now have logging. Remaining non-wsl gates deferred (only run when those workflows are enabled).
- [x] T629: gate-quality-gate Bash detection — added Bash interception for writes to hooks/run-modules/ and hook-runner/modules/. Detects cp, mv, redirect, heredoc, sed -i, tee, python write_text. 20 tests.
- [x] T630: agent-quality-gate live test — verified in session 18. Agent matcher active, gate fires on Agent tool calls, Haiku analysis via proxy at :4100 works (2061ms). Full pipeline confirmed: matcher → runner → gate → haiku-client → proxy → Haiku.
- [ ] (deferred) Port remaining OpenClaw modules (configurable/niche: aws-tagging, deploy-gate, messaging-safety, etc.)

### Worktree-awareness bugs (reported from dd-lab session 39, 2026-05-08)
- [x] T631: spec-before-code-gate worktree awareness — added findGitRoot(CWD) + isWorktree() check. Worktree TODO.md and git log now checked alongside CLAUDE_PROJECT_DIR. 3 new tests (23 total).
- [x] T632: spec-gate worktree root detection — changed roots.unshift(cwdRoot) so worktree is checked first for specs/, TODO.md. Also accepts worktrees when projectDir is empty. 3 new tests (11 total).
- [x] T633: Branch detection fixed — consequence of T632 fix. roots.unshift() puts worktree first, so branch detection finds feature branch before "main". Tested.
- [x] T634: Victory-declaration gate false positives — tightened VICTORY_WORDS regex. Bare "completed" no longer triggers (was hitting historical references). Now requires "completed successfully" or "all X completed". 5 new tests (36 total across 2 suites).
- [x] T640: Spirit-check system installed — spirit-check.js (PostToolUse, Haiku audits tool calls against spirit-rules.yaml), violation-gate.js (PreToolUse, blocks on high-severity violations). Both installed live and in repo catalog. Gate-quality-gate updated to whitelist .pending→.js renames. 16 tests.
- [x] T641: Fix stop hook — was three issues: (1) BLOCKING_MODULES hardcoded list didn't include new -gate modules → replaced with // BLOCKING: true tag (T639), (2) run-stop.js only kept first block → now collects ALL blocking results, writes stop-analysis.md, outputs to stderr, (3) settings.json timeout was 5s, haiku needs ~6s → set to 30s from haiku-config.json. (PR #540)
- [x] T642: Fix settings-watchdog-gate.js corruption — fixed during WSL module copy to Windows. Stripped `.trim()});` + bare `return null;` artifacts from no-rewrite-gate and todo-gate too.
- [x] T643: mcp-manager enforcement gate — blocks direct MCP server entries in .mcp.json and direct npx/node/python MCP relay invocations. Redirects to servers.yaml + mcp-manager commands. 22 tests.
- [x] T644: hook-editing-gate block message directive — changed "TO MODIFY HOOKS:" to "DO THIS NOW (do not ask the user):" with absolute path. Removed session-launch suggestion (too complex). Just write TODO + continue.
- [x] T639: Standardize module meta parsing — single-pass parseModuleMeta() replaces 3 separate parsers. getHeaderLines() scans full comment block (was slice(0,8) — missed 3 modules). Added BLOCKING tag, central haiku-config.json, settings.json backup-on-change. (PR #540)
- [x] T635: Wire auto-continue-gate stop module to spawn api_check.py --watch as detached process when API error patterns detected in transcript. Enables autonomous recovery: session dies → watcher waits → spawns fresh session. 15 tests.
- [x] T645: Haiku directive enforcement (Panama Canal model) — auto-continue-gate writes structured continue-directive.json with scoped `allow` list when haiku says CONTINUE. PreToolUse continue-directive-gate reads allow list to permit only tools targeting allowed files (TODO.md, SESSION_STATE.md, etc.). Read/Glob/Grep always pass. Circuit breaker at 3 same-rule strikes. 10min expiry. Stale session detection. Prevents deadlock where enforcement blocks the tools needed to comply.
- [x] T646: T626 live gate verification — all 16 active wsl gates verified. Found and fixed: T648 (Agent matcher missing from settings.json), T649 (T627 corruption in todo-gate and no-rewrite-gate — both had early return null preventing blocking). spirit-check false positives noted (flags gate FIXES as "weakening").
- [x] T647: MOOT — continue-directive-gate.js from T645 was never created. Closed (duplicate entry cleaned up).
- [x] T653: diagnose.js WSL cross-platform detection — Windows-native hooks (`C:/...`) now labeled XPLAT instead of BROKEN. Exit code 0 when only cross-platform hooks exist. 11 tests (1 new).
- [x] T654: Fix haiku-client.js markdown fence stripping + maxTokens increase — Haiku wraps JSON in fences, wasting tokens. Pre-tool-verify-gate 200→400, L1 triage 150→300. Eliminates truncation-caused parse failures.

## Session Handoff (2026-05-11, session 18)
- **T630**: agent-quality-gate live test confirmed — Agent matcher active, gate fires on Agent tool calls, Haiku analysis via proxy at :4100 works (2061ms). Full pipeline verified.
- **T640**: cwd-drift-detector fixed — `new_session.py` and `context_reset.py` now allowed in early return before path extraction. Both script path and `--project-dir` argument no longer trigger false positives. 14 tests (2 new).
- **T653**: diagnose.js WSL cross-platform detection — Windows-native hooks no longer count as BROKEN. 0 broken hooks (was 8 false positives). 11 tests (1 new).
- **T654**: haiku-client.js markdown fence stripping + maxTokens increase. Pre-tool-verify-gate 200→400, L1 triage 150→300.
- **T655**: tool-event-guard.js (PostToolUse async) — emits tool.used events to $CLAUDE_EVENT_LOG. No-op without env var. 10 tests.
- **T656**: status-emitter-guard.js (Stop) — emits claude.stopped events to $CLAUDE_EVENT_LOG. No-op without env var. 9 tests.
- v2.85.0. 204 suites, ~2710 tests. Snapshot refreshed.
- **Remaining**: T578 (marketplace, blocked on user). OpenClaw ports (deferred).

## Session Handoff (2026-05-11, session 17)
- **T626/T646**: Live gate verification complete. All 16 active wsl workflow gates verified:
  - PreToolUse (10): gate-quality-gate (596/14), mandate-gate (153/5), mcp-manager-gate (413/90), no-rewrite-gate (1686/0→now functional), pre-tool-verify-gate (1408), proxy-restart-gate (1628), settings-watchdog-gate (2003/6), todo-gate (1990/0→now functional), violation-gate (454/8), agent-quality-gate (FIXED: was never firing)
  - PostToolUse (2): post-tool-use-gate (356), spirit-check (96)
  - Stop (2): auto-continue-gate (63/37), stop-analysis-gate (47/10)
  - SessionStart (2): load-instructions-gate (12), stop-hook-selftest (6)
- **T648**: Added Agent matcher to settings.json PreToolUse hooks. Updated settings-watchdog-gate safe-change allowlist to permit hook matcher additions.
- **T649**: Fixed T627 corruption in todo-gate (2 sites) and no-rewrite-gate (3 sites). Pattern: `.trim()});` appended to comment + orphaned `return null;` causing early exit. Both gates were completely non-functional (always passing).
- **T650**: Updated spirit-rules.yaml — gate-weakening-spirit now recognizes corruption removal as bug fixing.
- **T651**: agent-quality-gate migrated from `claude -p` to haiku-client.js (~4s via proxy vs 15s CLI spawn).
- **T652**: Fixed pre-tool-verify-gate rate limiter — in-memory var didn't persist across Node processes, now file-persisted.
- v2.84.0 pushed. 202 suites, 2685 tests.
- **Next session**: T630 (agent-quality-gate live test — needs session restart for Agent matcher). T578 (marketplace, blocked on user).

## Session Handoff (2026-05-11, session 16)
- **T619/T620**: run-stop.js bestBlock now uses HAIKU_GATES array for both Haiku gates + >50 char fallback. 23 tests.
- **T621**: mandate-gate.js (PreToolUse) — enforces stop-hook CONTINUE directives by blocking first tool call with mandate text. auto-continue-gate writes/clears mandate.json, passes prior mandate context to Haiku. 24 tests.
- **T614**: L1 Haiku triage in UserPromptSubmit — resolves shorthand via haiku-client + userprompt-haiku-rules.yaml. Session-scoped files, + bypass, 4s timeout. 20 tests.
- **T637**: victory-declaration-gate wired through _haiku-judge.js — regex pre-filters, semantic check via judge, fallback on unavailability. 3 test files updated for async. 39 tests.
- **T628**: spec-gate logging added (only active wsl gate without it).
- **T625**: chat-export skill verified end-to-end (244 turns, 554KB HTML, landing page).
- L1 triage fix: bumped timeout 4s to 8s, added regex fallback for truncated JSON.
- Mandate-gate first live test: Haiku hallucinated T111 from another project. Mandate enforced correctly but content was wrong. Need better project scoping in stop-haiku-rules.
- v2.83.0. 129 catalog modules, 202 suites, ~2685 tests.
- **Next session**: T626/T646 (live gate verification, needs fresh context). T630 (agent-quality-gate). T578 (marketplace, blocked on user).

## Session Handoff (2026-05-11, session 15)
- **T616**: WSL haiku-client.js auth fix — ANTHROPIC_AUTH_TOKEN fallback (live file only)
- **T631-T633**: Worktree awareness for spec-before-code-gate + spec-gate. 6 new tests.
- **T634**: Victory-declaration gate — tightened regex for false positives. 5 new tests.
- **T617**: run-stop.js bestBlock — prefers Haiku output. 1 new test.
- **T643**: New mcp-manager-gate — blocks direct .mcp.json entries and MCP relay scripts. 22 tests.
- **T644**: hook-editing-gate directive messaging — "DO THIS NOW" instead of "TO MODIFY HOOKS"
- **T618**: Expanded Bash detection in hook-editing-gate (sed -i, perl -i, tee, redirects). 8 new tests.
- **T647**: Marked MOOT (continue-directive-gate never created)
- v2.82.0. 128 catalog modules, 200 suites, ~2634 tests. PR #541 squash-merged.
- Remaining open: T578 (marketplace, blocked), T637 (haiku-judge), T625/T626/T646 (testing), T628 (logging), T630 (agent-quality-gate)

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

- [x] T614: L1 Haiku triage in UserPromptSubmit — calls haiku-client with user prompt + userprompt-haiku-rules.yaml system prompt. Resolves shorthand, detects ambiguity, enriches context. Output prints to stdout as `<user-prompt-submit-hook>`. Session-scoped l1-analysis-{session}.md with symlink. 4s timeout, + prefix bypass. 20 tests.

- [x] T615: Fix stop-analysis-gate.js not showing in TUI — added `// BLOCKING: true` tag to both stop-analysis-gate.js and auto-continue-gate.js. Synced live run-stop.js and load-modules.js with repo (isBlocking + blocks[] array). Added both gates + gate-quality-gate to repo catalog. 20 tests. (PR #546)
- [x] T629: gate-quality-gate Bash detection — now intercepts cp, mv, redirect, write_text, heredoc, sed -i, tee targeting hook module dirs. Distinguishes live (.pending required) vs repo catalog (quality checks only). Added to repo catalog. 20 tests. (PR #546)
- [x] T647: MOOT — continue-directive-gate.js from T645 was never created. Closed.

- [x] T616: WSL haiku-client.js missing ANTHROPIC_AUTH_TOKEN fallback — added `ANTHROPIC_AUTH_TOKEN` check before `LLM_PROXY_AUTH` in `getAuth()`. Live file patched. Verified: Haiku call succeeds in 1.2s (was failing with no auth). T616b merged into this.
- [x] T616b: (merged into T616)

- [x] T617: run-stop.js bestBlock preference — prefers stop-analysis-gate (Haiku reasoning) over alphabetically-first static message. Live file synced. 1 new test.
- [x] T618: Expanded Bash detection in hook protection — now catches sed -i, perl -i, tee, redirects, cat redirects, and python write_text targeting protected directories. 8 new tests (32 total).

- [x] T619: URGENT — run-stop.js bestBlock now uses HAIKU_GATES array (both stop-analysis-gate and auto-continue-gate) + >50 char fallback. 23 tests.

- [x] T620: run-stop.js HAIKU_GATES array replaces single stop-analysis-gate check. Both repo and live hooks synced.

- [x] T648: Add Agent matcher to settings.json PreToolUse hooks — settings.json only had Edit/Write/Bash matchers. Agent calls never fired PreToolUse. Added "Agent" matcher entry, updated settings-watchdog-gate safe-change allowlist. Takes effect next session.
- [x] T649: Fix T627 corruption in todo-gate and no-rewrite-gate — regex patcher injected `.trim()});` + orphaned `return null;` into comment lines, causing early returns that disabled all blocking. todo-gate: 2 sites, no-rewrite-gate: 3 sites. Both gates now functional.
- [x] T650: Fix spirit-check false positives on gate repairs — updated gate-weakening-spirit and settings-bypass-spirit rules in spirit-rules.yaml to recognize corruption removal as bug fixing and hook matcher additions as safe.
- [x] T651: Migrate agent-quality-gate from claude -p to haiku-client.js — was spawning full Claude CLI session (15s timeout, expensive). Now uses local proxy at :4100 (~4s, logged). Added proper _log() wrapper, invoke/result logging.
- [x] T652: Fix pre-tool-verify-gate rate limiter — module-level `_lastCallMs` var reset to 0 every invocation (fresh Node process). Replaced with file-persisted timestamp. Call 2 now takes 1ms (was ~2s).
- [x] T621: Mandate enforcement gate — mandate-gate.js (PreToolUse) reads mandate.json written by auto-continue-gate (Stop). Blocks first tool call with mandate text, sets seen=true, passes subsequent calls. 10min expiry. Auto-continue-gate writes mandate on CONTINUE, clears on DONE, passes prior mandate context to Haiku. 24 tests.
