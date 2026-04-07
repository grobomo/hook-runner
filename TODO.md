# hook-runner — Project Tracking

## Overview
Modular hook runner system for Claude Code. One runner per event, modules in folders.
- Repo: grobomo/hook-runner (public)
- Marketplace: grobomo/claude-code-skills → plugins/hook-runner
- Local skill: ~/.claude/skills/hook-runner/
- Live hooks: ~/.claude/hooks/ (run-*.js, load-modules.js, run-modules/)

## Completed
- [x] T001-T002: Specs, project structure, sync runners with live system
- [x] T003-T007: Setup wizard (scan → report → backup → install → verify)
- [x] T008-T010: SKILL.md, marketplace plugin, README
- [x] T011: Report — flow diagram, expandable modules with source, consistent terminology
- [x] T012: Report fixes — chevron on left, no double line spacing
- [x] T013: Cleanup — TODO, stale branches, gate fixes documented

## Completed (continued)
- [x] T014-T015: Sync repo modules with live fixes, sync local skill
- [x] T016-T019: Module catalog (15 modules), YAML config, sync from GitHub
- [x] T020: Fix enforcement-gate — dirty-tree check only on main (not task branches)
- [x] T021: Sync marketplace copy, fix catalog/bundled auto-continue divergence

## Completed (logging)
- [x] T022-T025: Hook logging, stats reader, report hit counts + sample triggers

## Completed (docs & marketplace)
- [x] T027: Add hook-log.jsonl to .gitignore in modules.example.yaml docs
- [x] T028: Marketplace push for claude-code-skills (hook-runner runners updated with logging)

## Completed (health check)
- [x] T029: Health check command — verifies runners, modules, settings, log writability

## Completed (async hooks)
- [x] T030: Async module support — runners detect Promises, await with 4s timeout, sequential execution preserved

## Completed (report + async)
- [x] T031: Report improvements — all events shown, clickable flow, Claude event labels, docs link

## Completed (marketplace + rules + examples)
- [x] T032: Marketplace sync — push T030 (async) + T031 (report) to claude-code-skills
- [x] T033: Update global rule hooks-must-be-sync.md → hooks-module-contract (async now supported)
- [x] T034: Create example async SessionStart module for claude-backup integration

## Completed (report v2)
- [x] T035: Report v2 — standalone hooks support, search/filter, expand/collapse, block-only stats
- [x] T036: README — highlight report as standalone tool, add health/sync commands, add backup-check module

## Bug Fixes
- [x] T037: Fix double-count bug in readHookStats (block result incremented twice) + add hook-log.js and run-async.js to installer
- [x] T038: Fix updateSettings losing custom events (detected but not preserved due to overwrite)

## Enhancements
- [x] T039: Log rotation in stats, --prune command, --version flag
- [x] T040: README — document prune and version commands
- [x] T041: Add --stats command for quick text summary of hook log

## Docs
- [x] T042: Document --stats command in README
- [x] T043: Add CLAUDE.md for project context
- [x] T044: Add secret-scan-gate PreToolUse module
- [x] T045: Add UserPromptSubmit runner + installer + health check support
- [x] T046: Update CLAUDE.md with accurate test counts and runner list
- [x] T047: Add module validation test (loads + calls every module with mock input)

## Test Count Fix
- [x] T048: Fix CLAUDE.md test counts (77 total: 16 runner + 6 wizard + 13 async + 32 module + 10 sync)

## UserPromptSubmit Modules
- [x] T049: Add prompt-logger UserPromptSubmit module (logs prompts to JSONL for audit)

## CLI Enhancement
- [x] T050: Add --list command (catalog vs installed modules comparison)
- [x] T051: Fix --list to scan project-scoped modules in all events (not just PreToolUse)
- [x] T052: Update SKILL.md with --list command, UserPromptSubmit runner, and keyword
- [x] T053: Add GitHub Actions CI test workflow + cross-platform path fix in test scripts
- [x] T054: Add CI badge to README + marketplace sync

## CLI & Modules
- [x] T055: Add --test CLI command (run all test suites from setup.js)
- [x] T056: Add --uninstall CLI command (clean removal of hook-runner from settings.json + runners)
- [x] T057: Add PostToolUse commit-message-check module (enforces conventional commit messages)
- [x] T058: Marketplace push for T055-T057 + SKILL.md update with test/uninstall commands
- [x] T059: Update README with test/uninstall commands and commit-msg-check module
- [x] T060: Add --help command and bump version to 1.1.0

## Refactor & New Features
- [x] T061: Extract generateReport + helpers into report.js (setup.js 1846→1261 lines, report.js 620 lines)
- [x] T062: Add no-hardcoded-paths PreToolUse module (blocks Write/Edit with absolute paths)
- [x] T063: Add --upgrade command (self-updater from GitHub, --dry-run/--force supported)

## Docs & Marketplace
- [x] T064: Update README + SKILL.md with --upgrade, --open, no-hardcoded-paths, report.js
- [x] T065: Marketplace push + version bump to 1.2.0

## New Modules & Refactor
- [x] T066: Add SessionStart module: `project-health` (runs --health on session start, warns about issues)
- [x] T067: Add PostToolUse module: `test-coverage-check` (warns if test files modified without running tests)
- [x] T068: Extract main() dispatch into command handler functions (main() 553→15 lines)

## Docs & Release
- [x] T069: Update README, CLAUDE.md, SKILL.md + version bump to 1.3.0 + marketplace push

## Sync & Maintenance
- [x] T070: Sync live module fixes back to repo catalog (branch-pr-gate, no-adhoc-commands, load-instructions, auto-continue)

## Documentation & Polish
- [x] T094: Complete Available Modules table in README (25+ modules undocumented)
- [x] T095: Fix minor code issues — duplicate comment numbering in healthCheck, var redeclaration in cmdWorkflow

## Health Check Fix
- [x] T096: Fix healthCheck() scanning archive/ dirs (same bug as T089 but in setup.js code path)

## Workflows as Primary Abstraction (T097+)

WHY: Modules are implementation details — workflows are the human-readable interface.
"Enable SHTD" is how a human thinks. The 9 modules behind it are how it's enforced.
On context reset, Claude reads workflow state and immediately knows all active constraints.

- [x] T097: Add `modules:` field to workflow YAML definitions listing which modules belong
- [x] T098: Add workflow-config.json (enabled/disabled state per workflow, global + per-project)
- [x] T099: Update load-modules.js filterByWorkflow to use enable/disable config (not just step-state)
- [x] T100: Tag every module with `// WORKFLOW: <name>` — no orphans
- [x] T101: Add `--workflow enable/disable <name>` CLI commands
- [x] T102: Add `--workflow audit` — list orphan modules, workflow coverage report
- [x] T103: Add `--workflow query <tool>` — show which workflows affect Bash/Edit/Write
- [x] T104: Update SessionStart module to inject active workflow summary on context reset
- [x] T105: Update docs (README, CLAUDE.md, SKILL.md) + version bump to 1.6.0
- [x] T112: Add why-reminder PreToolUse gate + WHY in all SHTD block messages

## Workflow CRUD Automation (T113)

WHY: Creating/editing workflows requires touching 3+ files (YAML, module, live copy).
Manual file management is error-prone and breaks the principle that workflows are the
primary abstraction. Automate CRUD so workflows are first-class CLI citizens.

- [x] T113: Add `--workflow create <name>` — generates YAML + optional module stubs + copies to live
- [x] T114: Add `--workflow add-module <workflow> <module>` — creates module file with WORKFLOW tag + WHY stub, adds to YAML, copies to live
- [x] T115: Add `--workflow sync` — copies all workflow YAMLs + tagged modules to live hooks dir

## Reduced-Friction SHTD + Dispatcher/Worker Model (T106+)

WHY: Current SHTD gates have too much ceremony for single-instance work. Reduce friction
so the workflow scales naturally from one Claude to a CCC fleet.

**Role separation:**
- Dispatcher: spec tasks, write e2e acceptance tests, create branches, distribute, monitor, merge
- Worker: receive task + e2e tests, write failing unit tests, implement, loop until pass, PR

- [x] T106: Relax spec-gate — accept TODO.md `- [ ] TXXX:` as valid task source (not just specs/*/tasks.md)
- [x] T107: Rename gsd-gate to test-checkpoint-gate, relax to auto-detect scripts/test/test-TXXX*.sh
- [x] T108: Add dispatcher-worker.yml workflow with role-aware steps
- [x] T109: Worker loop module — blocks PR until e2e test script exits 0
- [x] T110: Enable SHTD globally with relaxed gates, verify single-instance workflow end-to-end
- [x] T111: Document dispatcher/worker model in README + CLAUDE.md

## Cross-Project Drift Detector & Runner Fixes (from chat-export session 2026-04-04)

- [x] T116: Commit cwd-drift-detector.js — new PreToolUse module that blocks cross-project file access and instructs Claude to spawn a new tab via context-reset. Allows TODO.md/SESSION_STATE.md writes and context-reset commands through.
- [x] T117: Commit PostToolUse runner cleanup — path normalization + exit(1) for blocks + stderr output
- [x] T118: Create hook-editing enforcement gate — PreToolUse module (WORKFLOW tag, WHY comment, exit(1) checks)
- [x] T119: Document hook design rule in CLAUDE.md (PreToolUse=blocking, PostToolUse=monitoring)
- [x] T120: Audit hooks repo — branch 002-T007 fully superseded by publish-ready + T106-T111. Deleted.
- [x] T121: Branch 002-T007-validate-self-analysis deleted (all fixes already in main via T117, T201-T204)

## Publish-Ready v2.0.0 (T201-T216)

WHY: hook-runner has 35+ modules and a workflow engine but isn't shareable —
hardcoded paths, outdated docs, friction on install/uninstall. Fix everything
so anyone can `npx grobomo/hook-runner` and get a working system.

See `specs/publish-ready/tasks.md` for full task list with checkpoints.

- [x] T201-T204: Clean — remove hardcoded paths from all modules
- [x] T205-T206, T208: Harden — onboarding --yes, uninstall --confirm, CI all suites
- [x] T207: Health check portable-paths validation
- [x] T209: CI install test (npx fresh install)
- [x] T210-T213: Document — README rewrite, troubleshooting, CLAUDE.md/SKILL.md
- [x] T214: Version bump to 2.0.0
- [x] T215: Marketplace sync (claude-code-skills) — synced v2.2.1 (76 files, 57 modules)
- [x] T216: E2e fresh install test

## Hook System Watchdog (T122-T129)

WHY: Test suite silently disabled shtd globally. No independent monitor caught it.
Watchdog runs every 10 min via OS scheduler, checks config, auto-repairs, alerts.

See `specs/watchdog/tasks.md` for full task list.

- [x] T122: watchdog.js — core checks + auto-repair + alert flag + logging
- [x] T123: watchdog-config.json — declares healthy state
- [x] T124: Fix T205 test — stop sabotaging global workflow-config.json
- [x] T125-T127: Scheduler integration (--install, --uninstall, --status)
- [x] T128-T129: SessionStart alert integration + --log command

## Docs & Polish
- [x] T217: Audit fixes — workflow-gate tag, gitignore cleanup, test count update
- [x] T218: Write Your First Module tutorial in README
- [x] T219: Version bump to 2.1.0

## Workflow Tag Alignment
- [x] T220: Fix 34 workflow tag mismatches + audit shared-module logic (PR #101)
- [x] T221: Update README workflow table with all 10 workflows + module counts (PR #102)
- [x] T222: Add split workflows to watchdog required list (PR #103)
- [x] T223: Add duplicate module detection to health check (PR #104)
- [x] T224: Exclude archive/ from --list project-scoped scan (PR #105)

## Live Cleanup
- [x] Archived 6 redundant shtd_* live modules (~140ms/call savings): shtd_branch-gate, shtd_pr-per-task-gate, shtd_remote-tracking-gate, shtd_secret-scan-gate, shtd_spec-gate, shtd_workflow-gate

## Refactor
- [x] T225: Extract cmdWorkflow into workflow-cli.js (setup.js 2041→1598 lines, PR #106)

## Release
- [x] T226: Version bump to 2.2.0

## Bug Fixes & Catalog Sync
- [x] T227: Add Windows path normalization to PreToolUse runner (PR #109)
- [x] T228: Sync 4 live modules to catalog + fix README module table (PR #110)
- [x] T229: Sync workflow YAML module lists with actual tags (PR #111)
- [x] T230: Version bump to 2.2.1

## Live Cleanup (session 2026-04-05b)
- [x] Archived 4 fleet-specific shtd_ modules (task-claim, e2e-merge-gate, audit-logger, task-release) — ~320ms/call savings

## Docs
- [x] T231: Add CHANGELOG.md covering all versions from 1.0.0 to 2.2.1

## Enhancements
- [x] T232: Show changelog diff in --upgrade output

## Release
- [x] T233: Git tags for all 11 versions + GitHub release for v2.2.1

## Context Optimization (session 2026-04-05c)
- [x] Moved 42 archived rules from ~/.claude/rules/archive/ to ~/.claude/rules-archive/
  - Rules were still loaded into every conversation (~8K tokens wasted)
  - All 42 rules are enforced by hook-runner modules at the tool-call level
  - 13 active knowledge/config rules remain in ~/.claude/rules/

## Bug Fix: config-sync stale lock (session 2026-04-05d)
- [x] T234: Fix config-sync module to detect and remove stale git index.lock before `git add`
- [x] T235: Fix config-sync to push current branch (not hardcoded `main`)
- [x] T236: Add `.git/*.lock` exception to archive-not-delete gate (stale lock cleanup is standard git recovery)
- [x] T237: Add module behavior test suite (archive-not-delete exceptions, config-sync structure)
- [x] T238: Update CLAUDE.md and TODO.md test counts (39 suites, 394 tests)
- [x] T239: Version bump to 2.2.2 + CHANGELOG entry

## Code Review (session 2026-04-05e)
- [x] T240: Code review fixes — ES5 consistency in workflow.js, path require cleanup in run-async.js, --confirm in help text (#120)
- [x] T241: Optimize load-modules.js — cache header reads so each module file is read once instead of twice per invocation
- [x] T242: Version bump to 2.2.3 + CHANGELOG entry + marketplace sync

## Zoom Out (session 2026-04-05f)
- [x] T243: Sync live hooks to ensure all v2.2.3 changes are active
- [x] T244: Evaluate npm registry publish — `hook-runner` taken (squatter), `claude-hook-runner` available but not worth maintenance overhead. GitHub install (`npx grobomo/hook-runner`) works well for niche audience.
- [x] T245: Add Windows CI job (GitHub Actions `windows-latest`) — tests already pass on Windows locally, CI validates cross-platform (#123)
- [x] T246: Community adoption: "Why hook-runner?" section in README — raw hooks vs modules vs workflows progression (#124)
- [x] T247: Integration guide in README — context-reset, skill-maker, mcp-manager, marketplace (#124)

## Code Review (session 2026-04-05f continued)
- [x] T249: Convert watchdog.js from ES6 to ES5 + fix cron shell injection (#126)
- [x] T250: Version bump to 2.3.1 + marketplace sync (#127)

## Release
- [x] T248: Version bump to 2.3.0 + CHANGELOG + marketplace sync (#125)

## Robustness
- [x] T251: Increase per-suite test timeout from 60s to 120s (module validation suite can timeout under load) (#128)
- [x] T252: Show failed suite names in --test output + FAIL marker for crashed suites (#130)
- [x] T253: Version bump to 2.3.2 + CHANGELOG + marketplace sync

## Discoverability
- [x] T254: Add GitHub repo topics (claude-code, hooks, workflow, etc.) + description for search visibility

## Workflow Cleanup
- [x] T255: Fix workflow YAML/tag mismatches — dispatcher-worker 9→1, cross-project-reset 0→1, archive enforce-shtd, update shtd 17→16

## Developer Experience
- [x] T256: Add --test-module command (test a single module with sample inputs, supports --input for custom JSON)

## Release
- [x] T257: Version bump to 2.4.0 + CHANGELOG

## Performance
- [x] T258: Optimize branch-pr-gate — defer getBranch() until after state-change check (~150ms savings for non-state-changing Bash commands)
- [x] T259: Add --test-module test suite (9 tests: usage, error handling, all event types, custom input)

## Release
- [x] T260: Version bump to 2.4.1 + CHANGELOG

## Cleanup
- [x] T261: Remove dead hasAsync var + --perf labels removed modules and excludes from overhead estimates
- [x] T262: Version bump to 2.4.2 + CHANGELOG

## Performance & sync-live
- [x] T263: Shared git context in PreToolUse runner — one git call shared across 4 modules (~80ms savings per tool call)
- [x] T264: Version bump to 2.4.3 + CHANGELOG
- [x] T265: sync-live now copies runners + project-scoped module subdirs (66→78 files)
- [x] T266: Version bump to 2.5.0 + CHANGELOG

## Bug Fix & DRY
- [x] T267: Fix uninstall leaving workflow.js and workflow-cli.js behind (#144)
- [x] T268: DRY — shared RUNNER_FILES constant for install/upgrade/uninstall (#145)
- [x] T269: Version bump to 2.5.1 + CHANGELOG

## Code Quality
- [x] T270: Add missing WORKFLOW/WHY headers to 4 project-scoped modules (#147)
- [x] T271: Module validation tests check headers + traverse subdirs (100→244 tests) (#148)
- [x] T272: Version bump to 2.5.2 + CHANGELOG

## Bug Fixes & DRY (session 2026-04-05g)
- [x] T273: Fix sync-live missing workflow.js and workflow-cli.js (#150)
- [x] T274: DRY — extract RUNNER_FILES to constants.js shared by setup.js and workflow-cli.js (#151)
- [x] T275: Fix uninstall leaving report.js behind + add constants.js to package.json (#152)
- [x] T276: Version bump to 2.5.3 + CHANGELOG
- [x] T277: Add missing files to watchdog required_runners (#154)
- [x] T278: Use RUNNER_FILES constant in health checks — 72→76 checks (#155)
- [x] T279: Version bump to 2.5.4 + CHANGELOG

## Code Quality
- [x] T280: Replace remaining .forEach() with for-loops for ES5 consistency (#157)
- [x] T281: Fix stale test count in TODO.md (544→532, archived modules reduced count)
- [x] T282: Sanitize env var inputs in config-sync to prevent command injection (#159)
- [x] T283: Version bump to 2.5.5 + CHANGELOG

## Docs
- [x] T284: Add --test-module to CLI Reference section in README (#161)

## Module Catalog
- [x] T285: Add terminal-title SessionStart module to catalog (#162)
- [x] T286: Version bump to 2.5.6 + CHANGELOG (#163)

## Performance & ES5 Fixes
- [x] T287: Optimize preserve-iterated-content — rev-list --count instead of log --oneline, timeout 3s→1.5s, fix .some() ES6→for-loop
- [x] T288: Fix rule-hygiene .includes() ES6 method → indexOf() for ES5 consistency
- [x] T289: Version bump to 2.5.7 + CHANGELOG (#165)
- [x] T290: Replace .startsWith()/.endsWith() ES6 with indexOf() in 9 module files

- [x] T291: Version bump to 2.5.8 + CHANGELOG (#167)

## Report Enhancement
- [x] T292: Add workflow + WHY metadata to HTML report — workflow summary cards, filter buttons, workflow badge per module, WHY text shown prominently (#168)

## Release
- [x] T293: Version bump to 2.5.9 + CHANGELOG (#169)

## Module Sync & Audit Fix
- [x] T294: Sync 2 drifted modules from live to catalog (spec-gate, test-checkpoint-gate)
- [x] T295: Add ep-incident-response project-scoped modules + customer-data-guard workflow + fix audit to scan subdirs (#170)

## Release
- [x] T296: Version bump to 2.5.10 + CHANGELOG (#171)

## Test Fixes
- [x] T297: Fix 3 failing test suites — spec-gate test needs spec.md + git commit, README module docs (#173)

## Hook Integrity Monitor (T298-T304)
See `specs/hook-integrity/` for full spec and tasks.
- [x] T298: workflow-compliance-gate PreToolUse — blocks if globally enforced workflow disabled at project level (#176)
- [x] T299: hook-integrity-check SessionStart — verify live modules match repo, auto-repair drift (#176)
- [x] T300: hook-integrity-monitor UserPromptSubmit (async) — spot-check modules each prompt (#176)
- [x] T301: --integrity CLI command — full scan with verbose output + --json mode (#179)
- [x] T302: Test suite — 18 tests covering all components (#176)
- [x] T303: Update README with integrity monitor modules (#177)
- [x] T304: Version bump to 2.6.0 + CHANGELOG (#178)

## Bug Fixes & Polish (session 2026-04-05h)
- [x] T305: Fix project dir decoding in --integrity CLI — greedy filesystem-aware decode (#180)
- [x] T306: Add decode tests + version bump to 2.6.1 (#181)
- [x] T307: Fix 2 failing test suites — T105 docs version extraction, T204 portable-paths comment (#183)
- [x] T308: Optimize spec-gate — use shared git context from runner (~45ms savings per Edit/Write) (#184)
- [x] T309: Version bump to 2.6.2 + CHANGELOG (#184)
- [x] Marketplace sync v2.6.1 → claude-code-skills
- [x] Pruned 100+ stale remote branches from merged PRs
- [x] Deleted stale local branch 174-T298-code-quality

## Performance (session 2026-04-05i)
- [x] T310: Share tracking remote in PreToolUse runner context — remote-tracking-gate uses input._git.tracking (~33ms savings per Edit/Write) (#187)
- [x] Version bump to 2.6.3 + CHANGELOG

## Bug Fix (session 2026-04-05j)
- [x] T311: Fix hook-integrity-monitor rate limiter — in-memory var was always 0 (fresh process each invocation), replaced with file-based timestamp (~85ms savings per prompt when rate-limited) (#189)
- [x] Version bump to 2.6.4 + CHANGELOG

## Report & Consolidation (session 2026-04-05k)
- [x] T312: Fix report expand/collapse for modules with WHY text (#190)
- [x] T313: Consolidate 11 workflows → 5 (shtd absorbs code-quality, infra-safety, messaging-safety, self-improvement, session-management). 40 modules retagged. Version 2.7.0. (#191)
- [x] T314: Add `--analyze` flag for `--report` — heuristic analysis engine (quality score, coverage gaps, DRY detection, perf spikes, redundancy, recommendations). No LLM dependency.
- [x] T315: Implement analysis fixes — tune spike detection (50x threshold + 500ms floor), fix duplicate WHY display (include event path), fix 4 test suites (T094/T097/T101/T104) broken by T313 consolidation, replace `find` with node in tests (Windows perf), add 4 missing modules to README, archive test artifact

## ES5 Consistency & Analysis Round 2 (session 2026-04-05l)
- [x] T316: Fix `.endsWith()`/`.startsWith()` ES6 calls in setup.js, workflow.js, workflow-cli.js → `.slice()`/`.indexOf()` for ES5 consistency
- [x] T316b: Fix 2 operator precedence bugs from ES5 conversion (`!f.charAt(0) === "."` → `f.charAt(0) !== "."`, `!slice(-3) === ".js"` → `slice(-3) !== ".js"`)
- [x] T315b: Analysis round 2 — skip SessionStart/Stop from perf bottleneck reports (run once, not per tool call), fix duplicate WHY false positive (same module across events), note preventive deterrent gates as "(may be preventive)", optimize hook-integrity-monitor spot-check (mtime+size instead of MD5), optimize interrupt-detector (tail-read instead of full JSONL parse)
- [x] T316c: Fix test-module-behaviors config-sync path (SessionStart archived, use Stop or repo fallback)

## Code Review (session 2026-04-05m)
- [x] T317: Fix 2 remaining `.endsWith()` ES6 calls in load-modules.js → `indexOf()` for ES5 consistency

## Release (session 2026-04-06a)
- [x] T318: Version bump to 2.8.2 + CHANGELOG entry for --deep, --input, ES5 fixes, operator precedence bug

## Session 2026-04-07b
- [x] T348: Version bump to 2.12.0 + CHANGELOG + marketplace sync (PR #209)
- [x] T338: spec-gate Bash gating restored — default-deny (PR #210)
- [x] T339: hook-editing-gate project-locked + self-edit protection + audit log (PR #210)
- Live hooks updated, all tests pass (14/14 gate, 8/8 task-id, 6/6 relaxed)
- [x] T349: Version bump to 2.13.0 for T338-T339

## Session 2026-04-07c
- Verified T338-T339 already merged (PR #210). Closed duplicate PR #212.
- Pushed test reliability fix to main (82f3998)
- Cleaned up stale branch 210-T338-T339-spec-gate-bash-hook-lock
- Next: T340 (spec-gate TODO.md fallback too permissive)
- Known issue: T106 spec-gate-relaxed test hangs intermittently on Windows Git Bash due to rapid process spawning. Not a code bug — need batch mode in test helper to reduce node invocations.

## Session 2026-04-07d
- T337 merged (PR #211): session isolation for hook state files
- T340 merged (PR #213): spec-gate TODO.md fallback tightened (feature branch required on main with specs/)
- T350: test reliability fixes, README module docs, version 2.14.0
- Live hooks synced (94 files), gh auth switched back to default
- CI has pre-existing failures in: T094 (README module count drift), hook-integrity/modules/runners (suite timeout crashes). Not caused by our changes — pass locally.
- Fixed T106 test: handle main/master branch name on CI + T340 feature branch requirement
- Pushed fix to main (67dfa52)

## Session 2026-04-07e
- Resumed from stop hook, verified branch state
- Fixed T106 test for CI compatibility (main vs master default branch)
- 3 CI failures remain: T106 (pushed fix), hook-integrity, modules (1 module fail each)
- Marketplace files copied to claude-code-skills/plugins/hook-runner/ (needs commit+push from that project)
- CI: T094 now passes, runners now passes (15/15). Remaining crashes are timeout-related (modules test loads 81+ modules in CI).

## Session 2026-04-07f
- Fixed T106 test: replaced JSON-embedded paths with argv (MSYS2 auto-translates argv but not embedded strings)
- Root cause: `path.resolve('/tmp/...')` on Windows → `C:\tmp\...` (wrong); MSYS2 argv translation → `C:/Users/.../Temp/...` (correct)
- All 7 T106 tests pass reliably now

## Session 2026-04-07g
- Marketplace synced to v2.14.0 (pushed to grobomo/claude-code-skills)
- T351 merged: reflection-score export fix + ES5 cleanup in run-modules

## Session 2026-04-07h
- Cleaned up 8 stale local branches (all PRs merged/closed)
- Fixed reflection-score.js export: function wrapper with utility methods as properties
- Synced shtd.yml: added 2 missing modules (session-cleanup, share-is-generic) — audit now 69/69
- Code review: ES5 consistency clean (no startsWith/endsWith/includes), all workflows match YAML
- Health: 100 OK, 0 warnings, 0 failures (was 99 OK, 1 failure)

## Session 2026-04-07i
- Resolved stash pop conflicts from previous session (TODO.md, project-health.js)
- Fixed operator precedence bug in project-health.js: `!x.slice(-3) === ".js"` → `x.slice(-3) !== ".js"`

## Session 2026-04-07j
- Fixed hook-integrity test for CI (skip marker file check, remove fs.existsSync for decoded paths)
- Verified all T338-T340 work merged and passing
- Version bumped to 2.14.1 (T351: health check fix, ES5 cleanup, shtd.yml sync)
- Pushed to main, live hooks synced, health 100 OK
- One untracked file: scripts/test/.worker-loop-helper.js (leftover — safe to delete)

## Session 2026-04-07k
- Fixed T106 test (PR #214 merged): replaced JSON-embedded paths with argv for MSYS2 path translation
- Fixed no-local-docker.yml contamination: temp module name `test-tmp-mod-569784-` was prepended to `block-local-docker`
- Hardened T114 test cleanup: added git show HEAD fallback if git checkout fails
- Pushed both fixes to main

## Session 2026-04-07l
- CI green: both Linux and Windows pass after T106 conflict fix + hook-integrity CI compat
- Root cause of T106 flaky test: git timeout (3s) under load → branch returns empty → T340 treats as main. Fixed by passing `_git.branch` in test input (matches production runner behavior).
- Cleaned leftover test artifacts (.worker-loop-helper.js, .spec-gate-helper.js, test-tmp-mod-570324.js)
- Synced spec-gate.js to live hooks

## Fixes & Sync
- [x] T352: Fix workflow-summary.js mock crash + sync 32 missing modules to run-modules/ + harden T114 test cleanup + git-HEAD optimization (PR #216)

## Session 2026-04-07m
What was done:
- Recovered from stale branch 211-T337-session-isolation (all work already merged via PRs #210-#215)
- Health check fix: reflection-score.js utility module accepted (100 OK → was 99 OK, 1 fail)
- T351 committed by hooks: reflection-score function wrapper, ES5 consistency, shtd.yml sync
- Version bumped to 2.14.1, pushed to origin/main
- ES5 audit: fixed trimStart/trimEnd in workflow.js, padEnd in workflow-cli.js
- Synced live modules to catalog (94 files), added 34 missing run-modules entries
- Created PR #215 for T352 sync work, merged locally
- Security review: all execSync calls sanitized, no injection vectors found
- Code review: no remaining ES6 string methods in core JS files

## Session 2026-04-07n
- Recovered from stuck shell (orphan test processes blocking bash)
- T114 test hardened: cleanup moved to trap EXIT, setup.js pre-test sweep of leftover artifacts
- workflow-cli.js add-module YAML edge cases fixed (empty array, empty key forms)
- All key tests pass: T114 (8/8), T106 spec-gate (7/7), module-sync (10/10), async (13/13)
- spec-gate.js getGitBranch reads .git/HEAD directly (no child_process spawn, no MSYS2 path issues)

## Session 2026-04-07o
- Pruned 28 stale remote branches (all merged PRs)
- Marketplace synced to v2.14.2 (18 files copied to claude-code-skills — needs commit+push from that project)
- Health: 99 OK, 0 warnings, 0 failures
- Workflow audit: 77 modules, all tagged, all matching YAML
- ES5 audit: clean — no startsWith/endsWith/includes/trimStart/trimEnd/padStart/padEnd
- Test suite timeout increased to 360s per suite (was 120s, insufficient for git-heavy suites on Windows)
- test-module-behaviors.sh updated: accepts `.git/HEAD` pattern (not just `rev-parse`) for branch detection check
- All 8 remaining remote branches deleted (4 squash-merged, 4 already pruned)
- Pulled PR #217 (T353: test safety guards, v2.14.3)
- Live hooks synced (94 files), health 99 OK
- [x] T354: Fix module return types — 8 modules returned bare strings instead of {decision:"block",reason:"..."} objects. Blocks were silently ignored. Fixed: claude-p-pattern, hook-editing-gate, no-fragile-heuristics, no-passive-rules, task-completion-gate, troubleshoot-detector, settings-change-gate (→ null)

## Next Actions (step 4 of stop-hook flow)
- [x] T355: Marketplace sync to v2.14.3 — files copied, needs commit+push from claude-code-skills project
- [x] T356: test-modules timeout fixed — removed timeout wrapper (Git Bash returns 124 for success). Added batch test script (_batch-module-test.js) for fast single-process validation. All 78 modules pass.
- [x] T357: Not a module bug — all 78 modules pass with HOOK_RUNNER_TEST=1. Failures were test runner timeouts on Windows.
- [x] T358: README refresh — module count updated (80+), SessionStart table verified (8 modules), all sections accurate
- [x] T359: N/A — `npx grobomo/hook-runner` already works via GitHub direct install. npm registry publish skipped (name `hook-runner` taken, would need `@grobomo/hook-runner` scoped package + npm org setup). GitHub install is the intended distribution path.

- [x] T361: DRY — extracted shared `isPidRunning` into `_is-pid-running.js`. Underscore prefix convention for helpers. load-modules.js + test-modules.sh skip `_` files. (PR #225)

## Session 2026-04-07h
- T351: Session collision detector (PR #223, #224) — detects multiple Claude Code tabs on same project
- T361: DRY isPidRunning helper (PR #225) — underscore prefix convention for non-module helpers
- T359: Closed as N/A — GitHub direct install already works
- system-monitor T027: TODO added for process-level Claude tab detection
- Next: version bump for T361, marketplace sync, code review pass

## Code Review & Cleanup
- [x] T362: Code review pass — update CLAUDE.md (stale self-reflection architecture, test counts), DRY brain URL parsing in self-reflection.js, fix url.parse deprecation, marketplace sync to v2.15.0 (PR #230)

## Spec-Gate Improvements
- [x] T363: Spec-gate subtask detection — when branch references T331, also check for unchecked T331a-T331z subtasks in specs/*/tasks.md. Fixes false-positive blocks when parent task is done but subtasks remain. (PR #232, #233)

## Housekeeping
- [x] T364: Marketplace commit+push — claude-code-skills synced to v2.15.1, 36 files (PR #234)
- [x] T365: Clean up 5 stale local branches (PR #234)
- [x] T366: Code review pass — fixed stale counts, verified 84 modules pass contract, 8 runners match live (PR #234)

## Docs Rewrite (Issue #194)
- [x] T367: Rewrite README — individual-first framing, no settings.json suggestions, portability value prop (PR #236, closes #194)
- [x] T368: Marketplace README sync — TODO written in claude-code-skills/TODO.md as T002 (cross-project, PR #236)

## YAML Sync
- [x] T369: Add session-collision-detector to shtd.yml modules list + fix T094 test helper exclusion (PR #238)

## Security Hardening
- [x] T370: Validate pid input in _is-pid-running.js — defense-in-depth against command injection (PR #239)

## Release
- [x] T371: Version bump to 2.15.2 + CHANGELOG for T369-T370 + marketplace sync (PR #240)

## Docs
- [x] T372: Fix CLAUDE.md push workflow — add modules/workflows sync with correct cp syntax (avoid nesting bug) (PR #241)

## Module Review Dashboard (T373)
- [x] T373: Add Module Review dashboard to HTML report — sortable table with verdicts (active/preventive/stale/dead/new), last-blocked dates, block rates, latency. Extended parseLogLines with timestamp tracking. (PR #242)

## Spec-Gate Fix
- [x] T374: Fix spec-gate false-positive fuzzy matching — when branch has taskId (TXXX), prefer exact task ID lookup over fuzzy word matching. Prevents "review" in branch matching specs/code-review-cleanup/. (PR #243)

## Session 2026-04-07p
- T369: shtd.yml sync — added session-collision-detector + T094 test helper exclusion (PR #238)
- T370: pid validation in _is-pid-running.js (PR #239)
- T371: Version bump to 2.15.2 (PR #240)
- T372: CLAUDE.md push workflow docs fix (PR #241)
- T373: Module Review dashboard in HTML report — sortable table with verdicts (PR #242)
- Marketplace synced to v2.15.2, fixed nesting bug (modules/modules/)
- Stale branch 237-bookkeeping-docs-complete remains (squash-merged, needs -D, needs user approval)
- Spec gate false positive: branch word "review" matches specs/code-review-cleanup/ — could improve matching to prefer task ID over fuzzy words
- Report.js and setup.js synced to live hooks

## Release
- [x] T375: Version bump to 2.15.3 + CHANGELOG for T374 + marketplace sync (PR #244)

## Status
- 299 tasks completed, 0 pending
- Version: 2.15.3
- Marketplace: claude-code-skills synced to v2.15.3
- CI: ALL GREEN (Linux + Windows)
- 84 modules across 5 workflows (2 active: shtd + customer-data-guard), 49 test suites
- Self-reflection system live: self-reflection (brain bridge) + reflection-gate + reflection-score + score-inject
- Scoring: Novice→Master levels, intervention tracking, full audit logging
- Health: 101 OK, 0 warnings, 0 failures
- Analysis score: A (0 demerits)
- Performance: PreToolUse ~913ms/call (47 modules, ~16ms avg each), SessionStart ~400ms (11 modules, debounced)
- CI: GitHub Actions runs tests + secret-scan on push/PR (Linux + Windows) — badge in README
- Workflow engine: workflow.js + workflow-gate.js + 5 workflow templates
- CLI: setup, report, health, sync, stats, list, test, test-module, upgrade, uninstall, prune, version, help, perf, export, workflow (list/audit/query/enable/disable/start/status/complete/reset/create/add-module/sync-live)
- Hook integrity monitor: live since 2026-04-05, enforces workflow compliance + file integrity across all sessions

## Performance & Features (v1.4.0)
- [x] T071: Add `env-var-check` PreToolUse module (blocks if required project env vars missing)
- [x] T072: Add per-module timing to hook-log (measure latency each module adds)
- [x] T073: Report v3 — timing data visualization, per-module latency chart
- [x] T074: Module dependency system — `requires:` field in module header, load-modules validates
- [x] T075: N/A — hot-reload is unnecessary (each hook invocation is a new Node process, require cache is always fresh)
- [x] T076: Update docs (README, CLAUDE.md, SKILL.md) + version bump to 1.4.0 + marketplace push

## Sync & Code Review
- [x] T077: Sync live module fixes back to repo (continuous-claude-gate SKIP_SPEC_GATE fix)

## Performance & Polish
- [x] T078: Add --perf command (analyze timing data, identify slow modules, estimate total hook overhead)
- [x] T079: Add workflow engine as first-class feature (workflow.js, workflow-gate.js, --workflow CLI, built-in templates)

## Workflow System (T080+)

WHY: Currently ~30 run-modules exist with no way to see the big picture — which relate to each other, which are obsolete, what rules they replaced. Workflows are groupings of modules that can be toggled on/off.

- [x] T080: Add --export command (export module config as shareable YAML bundle)
- [x] T081: Hook runner checks workflow enabled state before running a module (module header: `// WORKFLOW: workflow-name`)
- [x] T082: Create `shtd.yml` workflow manifest — groups spec-gate, gsd-gate, branch-pr-gate, remote-tracking-gate
- [x] T083: Create `no-local-docker.yml` workflow + block-local-docker module
- [x] T084: Create `messaging-safety.yml` workflow + existing messaging guard modules
- [x] T085: Sync workflow.js, workflow-gate.js, workflows/ to live hooks + skill + marketplace
- [x] T086: Tests for workflow engine (YAML parsing, state management, gate checking) — done in T081
- [x] T087: Update README, CLAUDE.md, SKILL.md with workflow docs + version bump

## Catalog Sync
- [x] T088: Sync 26 live modules to repo catalog, fix 2 return-type bugs (load-lessons, drift-review)

## Health & Test Fixes
- [x] T089: Fix health check scanning archive/ dirs (skip superseded modules), fix T088 test timeout (85s→5s)

## Security Hardening
- [x] T090: Sanitize inputs in fetchFromGitHub and openFile to prevent command injection

## Packaging
- [x] T091: Add package.json for npx install (`npx grobomo/hook-runner`)

## Release
- [x] T092: Version bump to 1.5.1, sync to marketplace + live

## Docs Update
- [x] T093: Update CLAUDE.md (test counts, package.json, help command), clean marketplace nested dup

## Moved
- T026: Moved to chat-export/TODO.md (out of scope for hook-runner)

## Self-Reflection Scoring System (session 2026-04-06c)
- [x] T326: Gamified reflection scoring — points for clean reflections, autonomy streaks, TODO follow-through. Penalties for user corrections, dismissed improvements, workflow violations. Levels (Novice→Master) control reflection frequency. Score persists across sessions via reflection-score.json, injected at SessionStart.
- [x] T327: User intervention tracking — analyze hook-log for correction prompts ("no", "stop", "wrong"), interrupts, autonomous stretches. Score rewards autonomy, penalizes babysitting.
- [x] T328: Full claude -p logging — every Stop runs LLM analysis, all prompts + responses + timing logged to reflection-claude-log.jsonl for audit and tuning.

## Release
- [x] T329: Version bump to 2.10.0 + CHANGELOG

## Session Handoff (2026-04-06c)
What was done this session:
- T319-T320: Synced no-adhoc-commands + cross-project-todo-gate to catalog
- T321-T323: Strengthened spec-gate (branch task ID enforcement, cross-project guidance, spec-before-code)
- T324: Self-reflection system (self-reflection.js + reflection-gate.js)
- T326-T328: Gamified scoring (reflection-score.js), intervention tracking, full claude -p logging
- T329: Version bump to 2.10.0
- All merged to main, synced to live hooks

HIGH PRIORITY — self-reflection design rule:
- Self-reflection NEVER implements fixes. It observes, analyzes, and writes TODOs.
- It delegates work back to hook-runner (the ego) which executes via SHTD workflow.
- Self-reflection is ephemeral and lightweight — an outside observer suggesting improvements.
- The hook-runner system picks up auto-generated TODOs and implements them properly.

User correction pattern observed:
- User frequently corrects Claude for skipping SHTD in other projects (e.g. unified-brain)
- Self-reflection should detect this pattern and write a TODO like:
  "T???: Add pre-edit SHTD verification — check .workflow-state.json exists in target project before allowing production code edits"
- Self-reflection does NOT implement the fix — it writes the TODO and moves on.

TOP PRIORITY — self-reflection scope enforcement + future architecture:
- [x] T330: Reflection-gate: when issues exist, allow edits to hook-runner modules (self-repair) + TODO.md/specs. Block all other production code. Self-reflection can fix its own system but delegates everything else via TODOs.
- [x] T331: Brain bridge — self-reflection tries unified-brain /ask endpoint first, falls back to direct LLM call. Analysis source logged for observability. BRAIN_URL configurable. 8 tests. (PR #227, #228, #229)
- [x] T332: Until T331, add lightweight session summary compaction — at Stop, append a one-line JSON summary to reflection-sessions.jsonl (files edited, issues found, score delta, corrections). Inject last 3 summaries into claude -p prompt for short-term memory.

## Session 2026-04-06d
- [x] T330: Reflection-gate scope enforcement (self-repair for hook-runner modules only)
- [x] T332: Session summary compaction (reflection-sessions.jsonl + inject into prompt)
- [x] T333: Version bump to 2.11.0 + CHANGELOG
- [x] T334: Fix 3 failing test suites (decodeProjectDir _prefix, module-sync utility exports, test paths)
- [x] T335: Unproductive loop detection in self-reflection (failed commands, retry patterns, manual patching)
- [x] T336: Marketplace sync v2.11.0
- Also fixed: nested-claude gate FP on gh_auto, DRY parseResponse, skip claude -p on no-edit stops
- Verified: reflection-score-inject works (score 2846, Master level)

## Superseded
- [x] T094: ~~Integrate hook-monitor~~ — superseded by hook-integrity system (T298-T304) + self-reflection (T324). No hook-monitor project exists.

## Catalog Sync & Spec-Gate Strengthening (session 2026-04-06b)
- [x] T319: Sync no-adhoc-commands module to catalog (Azure/terraform/azcopy/RDP blocks from live)
- [x] T320: Add cross-project-todo-gate module to catalog + fix hardcoded prefixes → dynamic discovery
- [x] T321: Strengthen spec-gate — extract TXXX from branch, verify specific task is unchecked (not just any task)
- [x] T322: Add cross-project guidance to all spec-gate block messages
- [x] T323: Add "Write the spec FIRST" reminder to all spec-gate block messages
- [x] T324: Self-reflection system — self-reflection.js (Stop, async, claude -p) + reflection-gate.js (PreToolUse). LLM reviews gate decisions at natural pauses, blocks if unresolved issues found.

## Bugs & Security
- [x] T337: Session isolation for hook state files — all temp flag files now include `process.ppid` in filename. 5 modules updated (instruction-detector, instruction-to-hook-gate, interrupt-detector, mark-turn-complete, troubleshoot-detector). Session-cleanup SessionStart module sweeps orphaned files. 8 tests pass.

- [x] T338: spec-gate Bash gating restored — default-deny: only allowlisted read-only commands (git, ls, cat, grep, etc.) pass through. Everything else (cp, mv, cargo, npm, node, python, etc.) requires spec chain satisfied. Closes the gap that let rogue sessions bypass SHTD.

- [x] T339: Hook editing project-locked to hook-runner — only sessions with CLAUDE_PROJECT_DIR containing "hook-runner" can edit hook infrastructure (modules, runners, core files, settings.json). Self-edit of hook-editing-gate.js always blocked (bootstrap protection). Static weakening detection. All edit attempts logged to ~/.system-monitor/hook-audit.jsonl. Tests: 14 pass.

- [x] T340: TODO.md fallback tightened — on main branch in projects with specs/ (mature projects), spec-gate now requires a feature branch instead of allowing blanket edits via TODO.md. Simple projects (no specs/) still use TODO.md directly. Feature branches enforce task ID matching via T321. 3 tests pass.

- [x] T351: Session collision detector — SessionStart module detects multiple Claude Code sessions on same project. Lock file per project+PID, warns on collision. session-cleanup sweeps stale locks. 8 tests. (PR #223, #224)

## UserPromptSubmit Safety & Self-Reflection Improvements (session 2026-04-07)
- [x] T341: hook-editing-gate blocks ALL UserPromptSubmit module creation. Any bug in a UPS module locks the user out with no recovery. Learned from frustration-detector incident (2026-04-07): module blocked every user prompt, making it impossible to fix. All UPS functionality must live in PreToolUse/PostToolUse/Stop instead.
- [x] T342: Self-reflection removes hasEdits guard — sessions with user frustration/corrections but no edits now get reflected on (previously the worst sessions were skipped entirely)
- [x] T343: Self-reflection prompt adds constraint-rejection and wrong-tool-for-intent analysis dimensions
- [x] T344: Reflection-score adds FRUSTRATION_DETECTED (-15) and RAPID_INTERRUPT_CLUSTER (-20) penalties from frustration-log.jsonl
- [x] T345: Archived frustration-detector.js — approach was fundamentally flawed (blocking on UPS). Future frustration detection must use flag files read by PostToolUse/Stop modules instead.

## Session 2026-04-07 Handoff
What was done:
- T341-T345: Banned all UserPromptSubmit modules via hook-editing-gate (PR #207, merged)
- Self-reflection: removed hasEdits guard, added constraint-rejection + wrong-tool analysis, frustration scoring
- Live hooks synced

Remaining from this session's discussion:
- [x] T346: Moved frustration detection into UPS runner itself (no modules). Runner logs prompt preview to hook-log + detects frustration patterns → frustration-log.jsonl. Self-reflection reads both at Stop. Never blocks.
- [x] T347: Self-reflection buildPrompt handles no-edit sessions — shows "NO FILES EDITED" warning so claude -p analysis flags unproductive sessions.
- [x] T348: Version bump to 2.12.0 + CHANGELOG + marketplace sync (T341-T347: UPS ban, frustration detection in runner, self-reflection improvements)
- Duplicate T refs removed — see Bugs & Security section above for T337-T340

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
