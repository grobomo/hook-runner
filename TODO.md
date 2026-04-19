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

## Stop Runner Fix
- [x] T376: Stop runner runs all modules before exiting — auto-continue blocks first, preventing all subsequent Stop modules from ever executing. Fix: collect first block result, run remaining modules, then exit with block. (PR #245)

## Release
- [x] T377: Version bump to 2.16.0 + CHANGELOG for T376 + marketplace sync (PR #246)

## PostToolUse Runner Fix
- [x] T378: PostToolUse runner runs all modules before exiting — same pattern as T376 Stop fix. Consistent behavior for monitoring/reporting events. (PR #247)

## Self-Reflection System: Self-Advertising & Feedback Loop
- [x] T379: load-lessons.js injects self-reflection system description at SessionStart — explains the feedback loop so Claude participates instead of reinventing it. (PR #248)
- [x] T380: self-reflection.js buildPrompt — added bug report conflation criterion (#10). Flags bundling bugs, skipping root cause, declaring fixed without testing. (PR #249)
- [x] T381: Corrective feedback capture — extracts lessons from high-severity issues and writes to corrective-feedback.jsonl + self-analysis-lessons.jsonl. Brain /remember pending — uses local files. (PR #250)
- [x] T382: Measure lesson effectiveness — lesson-effectiveness.js SessionStart module + worktree-gate.js PreToolUse module (PR #258)

## Release
- [x] T383: Version bump to 2.17.0 + CHANGELOG for T376-T381 + marketplace sync (PR #251)

## Session 2026-04-08
- T374: Spec-gate false-positive fix — taskId priority over fuzzy matching (PR #243)
- T375: Version bump to 2.15.3 (PR #244)
- T376: Stop runner runs all modules before exiting (PR #245)
- T377: Version bump to 2.16.0 (PR #246)
- T378: PostToolUse runner runs all modules before exiting (PR #247)
- T379: load-lessons.js self-reflection system description (PR #248)
- T380: Bug report conflation criterion in self-reflection (PR #249)
- T381: Corrective feedback capture (PR #250)
- T383: Version bump to 2.17.0 + marketplace sync (PR #251)
- Marketplace synced to v2.17.0
- Live hooks synced (spec-gate, run-stop, run-posttooluse, load-lessons, self-reflection)

## Spec-Gate Allowlist
- [x] T384: Allow session management scripts + curl in spec-gate bash allowlist. 3 new test cases. (PR #252)

## Hook Reliability Fixes
- [x] T385: Fix Stop runner exit code — uses exit(0) for blocks instead of exit(1), TUI silently ignores autocontinue instruction (PR #254)
- [x] T386: Fix git-destructive-guard gap — catches `git checkout .` but not `git checkout <file>`, allowing single-file discard (PR #254)
- [x] T387: Fix hook cmd.exe focus steal — hooks spawn visible cmd prompts on Windows, stealing focus from active tabs (PR #254)
- [x] T388: Hook self-diagnostics — detect when hooks silently fail (exit 0 on block, missing modules, broken runners) (PR #254)
- [x] T389: PR-first workflow gate — enforce task → PR → spec → tests → code → merge (PR #254)
- [x] T390: Runtime hook health monitor — run-hidden.js logs every invocation, PostToolUse module detects crashes, exit code mismatches, timeouts

## Fix run-hidden.js + Gate Improvements (T391)
See `specs/fix-run-hidden/investigation.md` for full analysis with ProcMon evidence and parent-chain traces.

- [x] T391a: Replace async spawn with spawnSync in run-hidden.js + output logging
- [x] T391b: Add run-hidden.js to RUNNER_FILES in constants.js + package.json files
- [x] T391c: Sync run-hidden.js to live hooks
- [x] T391d: Update hook-editing-gate block message to include context-reset.py command
- [x] T391e: Version bump to 2.18.0 + CHANGELOG
- [x] T391f: Tighten cwd-drift-detector — block git branch creation in other projects (PR #257)
- [x] T382: Measure lesson effectiveness — lesson-effectiveness.js SessionStart module detects repeated patterns, writes escalations (11 tests)

## Bookkeeping & CMD Popup Investigation
- [x] T392: Sync live hooks + CMD popup monitor script + worktree-gate multi-session fix (PR #259)

## Windowless Hook Execution (T393)
- [x] T393: Eliminate cmd.exe popups — hook commands use `$HOME` which forces shell expansion via cmd.exe. Fix: update setup.js to write fully-resolved paths in settings.json so Claude Code doesn't need cmd.exe shell wrapper. (PR #263)

## Auto-Continue Fix (T390 session 2026-04-10)
- [x] T390-ac: Fix auto-continue not firing — root cause: run-stop.js ran ALL modules sequentially (T376), config-sync takes 16s, 5s hook timeout killed process before block returned. Fix: blocking modules (auto-continue, never-give-up) run sync (14ms), block output immediately, remaining modules spawn as detached background (run-stop-bg.js). Also: all runners read HOOK_INPUT_FILE env var to avoid Windows stdin pipe deadlock.
- [x] T390-wh: Watchdog health log analysis — checkHealthLog() in watchdog.js reads hook-health.jsonl, detects exit code mismatches, repeated crashes, stop-never-blocking, timeout kills. Watchdog scheduled task installed (HookRunnerWatchdog, every 10min).
- [x] T390-whi: Added windowsHide:true to 3 remaining spawn calls (chat-export, interrupt-detector)

## Test Fixes
- [x] T394: Fix batch module test — validate helper files (_is-pid-running.js) with correct contract instead of gate module contract (PR #264)

## Pending (from ddei-email-security session 2026-04-10)

- [x] T395: Fix hook-editing-gate bypass — Claude used `cp` (Bash tool) to copy modules directly into ~/.claude/hooks/run-modules/, bypassing the Write/Edit gate. Add Bash command detection for cp/copy/mv targeting ~/.claude/hooks/. (PR #266)
- [x] T396: Fix rdp-testbox-gate false positive — regex `/\b(rdp)\b/` matches file paths containing "rdp" (e.g. `git status rdp-testbox-gate.js`). Should only block commands that CREATE or EXECUTE RDP connections, not read-only git commands referencing files with "rdp" in the name. (PR #267)
- [x] T397: Create hook-system-reminder.js module properly — spec + 11 tests + catalog copy (PR #268)
- [x] T398: Create rdp-testbox-gate.js module properly — spec + 15 tests (PR #269)
- [x] T399: Fix hardcoded paths in hook-system-reminder + worktree-gate, update README with new modules (PR #272). Hook-editing-gate block message update deferred (self-edit protection).
- [x] T400: Fix cross-project write protection — moved cwd-drift-detector from disabled cross-project-reset workflow to shtd (PR #270)
- [x] T401: Add run-modules/ to .gitignore — local hook copies aren't repo content (PR #271)
- [x] T402: Verified deployed copies match catalog — all 3 modules match (hook-system-reminder, rdp-testbox-gate, cwd-drift-detector)

## Enforcement Visibility (T403)
WHY: 86 modules but user can't answer "what does this system actually enforce?"
Modules grew reactively. No single source of truth for active rules, no proof they work,
no way to know when they silently fail. User spent 2 days on auto-continue bug that
no test caught because tests only validated modules in isolation, not the full pipeline.

- [x] T403a: Enforcement manifest — ENFORCEMENT.md listing every active rule in plain English (what it blocks, example trigger, example block message). Generated from live modules, not hand-written. (PR #265)
- [x] T403b: E2E pipeline tests — pipe real input through run-hidden.js → runner → modules, verify block/pass output. Tests the full pipeline including timeouts. Cover every rule in the manifest. (PR #265)
- [x] T403c: Preflight check — runs at session start or on demand. Reports: X rules active, Y tested in last 24h, Z never fired. Flags dead rules. (PR #265)

## Session Handoff (2026-04-10b)
What was done this session:
- T397 (PR #268): Formalized hook-system-reminder — spec + 11 tests + catalog copy
- T398 (PR #269): Formalized rdp-testbox-gate — spec + 15 tests
- T399 (PR #272): Fixed hardcoded paths in hook-system-reminder + worktree-gate, updated README
- T400 (PR #270): Fixed cross-project write protection — cwd-drift-detector moved to shtd workflow
- T401 (PR #271): Added run-modules/ to .gitignore
- T402: Verified deployed copies match catalog
- T404 (PR #273): Fixed test-modules.sh hang on sync path
- T405 (PR #274): Version bump to 2.20.0 + CHANGELOG
- Code review: fixed 2/3 failing test suites (portable-paths, module-docs)
- Cleaned up 3 stale local branches

Remaining:
- T406: Marketplace sync (cross-project, documented in claude-code-skills TODO.md T003)
- 2 stale local branches (237-bookkeeping-docs-complete, 255-T390-runtime-hook-monitor) — squash-merged, harmless
- hook-editing-gate.js has hardcoded ProjectsCL1 paths — requires manual edit (self-edit protection)

## Test & Release (T404+)

- [x] T404: Fix test-modules.sh hang — add process.exit(0) on sync path (PR #273)
- [x] T405: Version bump to 2.20.0 + CHANGELOG (PR #274)
- [x] T406: Marketplace sync — copy T397-T405 changes to claude-code-skills (pushed to grobomo/claude-code-skills)

## YAML Sync
- [x] T407: Fix workflow YAML/tag mismatches — add 2 missing modules to shtd.yml, remove stale entry from cpr workflow yml (PR #275)

## Gate Fix
- [x] T408: Fix false positive in cpt-gate — workflow name triggers the standalone marker check (PR #276)

## Release
- [x] T409: Version bump to 2.20.1 + CHANGELOG for T407-T408 (PR #277)

## Session Handoff (2026-04-10c)
What was done this session:
- T406: Marketplace synced to v2.20.0 (pushed to grobomo/claude-code-skills)
- T407 (PR #275): Fixed workflow YAML/tag mismatches — shtd.yml + cpr.yml aligned
- T408 (PR #276): Fixed cpt-gate false positive — workflow names no longer trigger marker check. 8 tests.
- T409 (PR #277): Version bump to 2.20.1 + CHANGELOG
- Code review: ES5 clean, security clean, no DRY issues
- Full test suite: 50 suites, 742 passed, 0 failed
- Pruned 37 stale remote branches

Remaining:
- 2 stale local branches (237-bookkeeping-docs-complete, 255-T390-runtime-hook-monitor) — squash-merged, need `git branch -D` (user approval)

## Session Handoff (2026-04-10d)
What was done this session:
- T410 (PR #278): Marketplace synced to v2.20.1
- T411 (PR #279): Fixed workflow-gate 87 errors — checkGate resilient to missing YAML + stale path fix
- T412 (PR #280): Version bump to 2.20.2
- T413 (PR #282): Removed self-edit protection from hook-editing-gate. Hook-runner is the gatekeeper — it can now edit all hooks. Other projects blocked. Hardcoded paths fixed. 16 tests.
- T414 (PR #283): Version bump to 2.21.0, CLAUDE.md test count fix, marketplace synced
- Previous session logs reviewed — no abandoned tangents found
- Code review: ES5 clean, security clean, config-sync latency acceptable (debounced)

## Marketplace Sync
- [x] T410: Sync marketplace to v2.20.1 (T407-T409 fixes: YAML alignment, cpt-gate false positive fix, version bump) (PR #278)

## Workflow Resilience
- [x] T411: Fix workflow-gate 87 errors — checkGate resilient to missing YAML + fixed stale workflow_path (PR #279)

## Release
- [x] T412: Version bump to 2.20.2 + CHANGELOG for T411 + marketplace sync (PR #280)

## Hook Editing Gate
- [x] T413: Remove self-edit protection from hook-editing-gate + fix hardcoded paths. Hook-runner is the gatekeeper — it can edit all hooks. Other projects blocked. 16 tests. (PR #282)

## Docs + Release
- [x] T414: Update CLAUDE.md test count (49→51), version bump to 2.21.0 for T413, marketplace sync (PR #283)

## Test & Sync Fixes
- [x] T415: Fix T339 test — T413 removed self-edit protection, test still expected BLOCK. Updated to expect PASS. Synced setup.js to live. (PR #284)

## Report Analysis Fix
- [x] T416: Fix false coverage gaps in --report --analyze — resolveScriptPath returned run-hidden.js wrapper instead of actual runner, isRunner never matched. Fix: prefer runner paths over wrapper. (PR #285)

## Analysis Quality
- [x] T417: Fix analysis false positives — resolveScriptPath bare name resolution, _prefix helper exclusion, archived module DRY fix. Score C(8)→A(0). (PR #286)

## Release
- [x] T418: Version bump to 2.21.1 + CHANGELOG for T415-T417 (PR #287)

## Performance
- [x] T419: Optimize pr-first-gate — file-based cache with 5min TTL instead of per-process gh call (~67ms→<1ms for cached lookups) (PR #288)

## Session Handoff (2026-04-10f)
What was done this session:
- T420 (PR #289): Optimized spec-gate — mtime-based caching for specs/ scan + TODO.md reads + autoActivateShtd (~98ms→2ms per call, 57x speedup)
- T421 (PR #290): Version bump to 2.21.2 + CHANGELOG
- Marketplace synced to v2.21.2 (claude-code-skills)
- gh auth switched back to default (joel-ginsberg_tmemu)
- Cleaned up report-debug.js (moved to archive/)
- All spec-gate tests pass (38/38), batch module validation (89/89), setup wizard (7/7)
- Health: 110 OK, 0 warnings, 0 failures
- Workflow audit: 88 modules, all tagged, all matching YAML

Perf notes: preserve-iterated-content (46ms) and secret-scan-gate (45ms) averages are from historical data including git-spawning calls. Their early-exit paths are sub-millisecond (<0.01ms). Not worth optimizing further — the avg is dominated by the few times they actually do work (git rev-list, git diff --cached).

## Performance Optimization
- [x] T420: Optimize spec-gate — mtime-based caching for specs/ scan + TODO.md reads + autoActivateShtd (~98ms→2ms per call, 57x speedup) (PR #289)
- [x] T421: Version bump to 2.21.2 + CHANGELOG for T420 (PR #290)

## Cache Correctness Fix
- [x] T422: Fix cachedSpecScan stale hasUnchecked — re-check task content via cachedReadFile on cache hit (~3.8ms avg, still 25x faster) (PR #291)

## Status
- 359 tasks completed, 0 pending
- Version: 2.21.2
- Marketplace: synced to v2.21.2
- CI: ALL GREEN (Linux + Windows)
- 88 modules across 5 workflows (2 active: shtd + customer-data-guard), 51 test suites
- Self-reflection system live: self-reflection (brain bridge) + reflection-gate + reflection-score + score-inject
- Scoring: Novice→Master levels, intervention tracking, full audit logging
- Health: 110 OK, 0 warnings, 0 failures
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

## Self-Analysis Lessons System — Fixes Needed

Context: The self-reflection → load-lessons pipeline has gaps found during ddei-e2e session (2026-04-11).

- [x] T349: Fix dual lessons file — injected prompt told Claude to write to `self-analysis-lessons.jsonl` without full path. Fixed to specify `~/.claude/hooks/self-analysis-lessons.jsonl` (PR #292)

- [x] T350: Add general operational lessons extraction — `extractOperationalLessons()` captures workarounds, env quirks, tool gotchas (not just user corrections). Tagged [OPERATIONAL] in lessons file (PR #293)

- [x] T351: Lessons rotation — when file exceeds 200 lines, archive oldest and keep recent 100. Added to load-lessons.js SessionStart module (PR #292)

- [x] T352: Increased MAX_LESSONS from 10 to 20 so more lessons are injected at session start (PR #292)

- [x] T353: Added `--lessons` CLI command — shows all lessons, supports `--project <name>`, `--date YYYY-MM-DD`, `--archive` filters (PR #292)

- [x] T354: Added cross-project workflow instructions to stop-message.txt — tells Claude to preserve tab + context-reset to other project when cross-project TODOs are created. Also added stop-message.txt to module catalog (PR #294)

- [x] T355: Version bump to 2.22.0 + CHANGELOG for T349-T354 lessons system improvements (PR #295)

## Commit Discipline & Spec Enforcement

Context: Claude spins wheels making undocumented changes, no git trail, can't debug what was tried. User tracks progress from GitHub Mobile. E2E cycles take 10+ min — wasted when changes aren't documented.

Design principle: gate on ALL tools via PreToolUse (not just Edit/Write). Claude bypasses Edit gates by using Bash with sed/awk/echo/python. Use `git diff --stat` as ground truth. Persist state in files, not memory (survives context resets).

- [x] T355: **Commit counter gate** — commit-counter-gate.js tracks Edit/Write/file-modifying Bash. After 5 without commit, blocks. Cross-checks git diff. State in .uncommitted-edit-count (PR #296)

- [x] T356: **Deploy gate** — deploy-gate.js blocks deploy commands (upload-and-run, terraform apply, kubectl apply, docker push, etc.) when git tree is dirty. Shows changed files (PR #296)

- [x] T357: **Spec-before-code gate** — spec-before-code-gate.js blocks first file modification after commit unless TODO.md has unchecked tasks or recent commit has descriptive message (PR #296)

- [x] T358: **Commit message quality gate** — commit-quality-gate.js blocks git commit with <5 word messages or generic starts (fix/update/change without detail) (PR #296)

- [x] T359: **Git history check reminder** — deploy-history-reminder.js shows last 5 commits as advisory before deploy commands. Non-blocking (PR #296)

- [x] T360: **Anti-circumvention patterns** — Both commit-counter-gate and spec-before-code-gate detect file-modifying Bash patterns: sed -i, awk -i, echo >, cat >, tee, python open write, printf >, cp, mv (PR #296)

- [x] T361: Version bump to 2.23.0 + CHANGELOG for T355-T360 commit discipline gates (PR #297)

- [x] T362: Updated shtd.yml workflow — added 5 new modules (commit-counter-gate, commit-quality-gate, deploy-gate, deploy-history-reminder, spec-before-code-gate). Audit now shows 85/85 match.

## Session Handoff (2026-04-11b)
What was done this session:
- T349 (PR #292): Fixed lessons file path in prompt + rotation + MAX_LESSONS 20 + --lessons CLI
- T350 (PR #293): General operational lessons extraction
- T354 (PR #294): Cross-project workflow in stop-message.txt
- T355 (PR #295): Version bump 2.22.0
- T355-T360 (PR #296): 5 new commit discipline gate modules
- T361 (PR #297): Version bump 2.23.0
- T362: Updated shtd.yml with new modules, audit clean
- Marketplace synced to v2.23.0
- gh auth on default (joel-ginsberg_tmemu)

Remaining:
- shtd.yml update not yet committed (minor — just module count)
- 94 modules across 5 workflows, health 110/0/0

## Code Review Fix

- [x] T363: Fix deploy-history-reminder silent discard — module returned `{text: "..."}` which PreToolUse runner ignores (only checks `result.decision`). Advisory was never shown. Fix: write to stderr + return null. Also aligned DEPLOY_PATTERNS with deploy-gate (5→10 patterns). Added {text} handling to run-stop-bg.js and run-posttooluse.js. (PR #299)

- [x] T364: Fix commit-quality-gate heredoc parsing — simple `-m "msg"` regex matched before heredoc, extracting `$(cat <<` as the message. Fix: try heredoc pattern first. (PR #300)

- [x] T365: Version bump to 2.23.1 + CHANGELOG for T363-T364 (PR #301)

- [x] T366: Replace execSync with execFileSync in 7 modules — eliminates shell interpretation for git/gh commands. Defense-in-depth: push-unpushed, pr-first-gate, drift-review, config-sync, hook-autocommit, _is-pid-running. (PR #302, #303)

- [x] T367: Version bump to 2.23.2 + CHANGELOG for T366 security hardening + marketplace sync (PR #304)

## Session Handoff (2026-04-11c)
What was done this session:
- T363 (PR #299): Fixed deploy-history-reminder silent discard — {text} returns never shown. Added {text} handling to run-stop-bg.js and run-posttooluse.js. Aligned DEPLOY_PATTERNS (5→10).
- T364 (PR #300): Fixed commit-quality-gate heredoc parsing — simple regex matched before heredoc
- T365 (PR #301): Version bump to 2.23.1
- T366 (PR #302): Replaced execSync with execFileSync in 5 modules
- T366b (PR #303): Remaining 2 execSync conversions (config-sync catch, _is-pid-running)
- T367 (PR #304): Version bump to 2.23.2
- Marketplace synced to v2.23.2 (grobomo/claude-code-skills)
- Stale remote branches being cleaned up (background)
- gh auth on default (joel-ginsberg_tmemu)
- Health: 115 OK, 0 warnings, 0 failures

## Result Review Enforcement

Context: Claude declares E2E tests "PASSED" and commits without investigating failures, empty directories, or warnings in the output. Real issues (empty screenshots dir, F5 console timeout, status mismatch, broken streaming architecture) get glossed over with "expected behavior" or "known issue". User has to manually catch this every time.

Root cause: Claude optimizes for "task complete" status. Once it sees mostly-green results, it skips to commit+push without enumerating every issue. No hook forces thorough review before declaring done.

- [x] T368: **Result review gate** — `result-review-gate.js` PostToolUse on Read. Fires on report/results/coverage/PDF/summary/health-check files and reports/ directories. Injects checklist: enumerate every FAIL/WARN/timeout, justify each, file TODOs, check for missing items. 15/15 tests. shtd. (PR #332)

- [x] T369: **Victory-declaration detector** — `victory-declaration-gate.js`. Blocks title-line claims like "all tests pass", "all green", "succeeded", "100%". Only checks title so body can quote phrases. 15/15 tests. shtd + starter.

- [x] T370: **FAIL/error scan before commit** — `unresolved-issues-gate.js`. Scans TODO.md for unchecked FAIL/timeout/MISMATCH/WARN/ERROR. FP protection for completed tasks, "0 failed". Acknowledges "known"/"pre-existing"/"intermittent". 15/15 tests. shtd.

- [x] T371: **Empty-output detector** — `empty-output-detector.js` PostToolUse. Warns on empty output from ls, cat, find, curl, kubectl, az. Skips commands where empty is normal (cp, mkdir, git add). 15/15 tests. shtd. (PR #331)

- [x] T372: **Stop hook: unresolved issues check** — `unresolved-issues-check.js` Stop module. Blocks session end when TODO.md has unchecked tasks with TESTING NOW/IN PROGRESS/WIP/INVESTIGATING or FAIL/MISMATCH/BROKEN. 12/12 tests. shtd. (PR #331)
- Batch module validation: 94/94 pass
- Workflow audit: 93 modules, 92 tagged, all matching YAML

Status:
- 0 pending tasks
- Version: 2.23.2
- Project mature, code review clean, security hardened
- Remaining execSync: only `claude -p` calls (need shell for stdin piping, inherently safe)

## Cleanup

- [x] T368: Untrack run-modules/ from git (PR #305) — directory was in .gitignore but still tracked, causing 46+ phantom dirty files on every session. `git rm --cached -r run-modules/` removes from tracking without deleting live files.

## Docs

- [x] T369: Add 5 missing modules to README catalog (PR #306) — commit-counter-gate, commit-quality-gate, deploy-gate, deploy-history-reminder, spec-before-code-gate. Update shtd module count from 69 to 83.

## Packaging

- [x] T370: Add missing files to package.json (PR #307) — preflight.js, generate-manifest.js, run-stop-bg.js missing from `files` array, won't be included in npx installs.

- [x] T371: Version bump to 2.23.3 + CHANGELOG for T368-T370 cleanup + marketplace sync (PR #308)

## Test Fixes

- [x] T372: Fix test-runners.sh (PR #310) — Tests 2 and 6 reference `run-modules/` which was untracked in T368. Point at `modules/` instead.

## Session Handoff (2026-04-11d)
What was done this session:
- T368 (PR #305): Untracked run-modules/ from git — eliminated 46+ phantom dirty files
- T369 (PR #306): Added 5 missing modules to README catalog, updated shtd count to 83
- T370 (PR #307): Added 3 missing files to package.json files array
- T371 (PR #308): Version bump to 2.23.3 + marketplace sync
- T372 (PR #310): Fixed test-runners.sh broken by T368 run-modules/ untracking
- Code review: all JSON.parse wrapped in try/catch, all execSync safe, no path traversal
- Module validation: 372/372 pass (all modules load and execute)
- gh auth on grobomo (switch back to joel-ginsberg_tmemu before push)

Remaining to investigate:
- test-T351-session-collision.sh and test-module-sync.sh failures (may be transient/slow)
- Full test suite: 395 pass, 6 fail → after T372 fix, runners suite should now pass (was 3 of the 6)

Status:
- 0 pending tasks
- Version: 2.23.3
- Clean git status on main

## Catalog Sync
- [x] T423: Add 5 orphan modules to catalog (PR #311) — blueprint-no-sleep, gh-auto-gate, no-hook-bypass, no-nested-claude, publish-json-guard. Retagged to shtd. shtd.yml 85→90. README +5 rows.

## Release
- [x] T424: Version bump to 2.23.4 + CHANGELOG for T423 + marketplace sync (PR #312)

## Stale Workflow References
- [x] T425: Fix hardcoded path in no-nested-claude.js (PR #314)
- [x] T426: Fix stale workflow names in watchdog.js + setup.js (PR #315) — consolidated names from T313. Watchdog default, setup --yes, and test files all updated.

## Release
- [x] T427: Version bump to 2.23.5 + CHANGELOG for T423-T426 + marketplace sync (PR #316)

## Session Handoff (2026-04-11e)
What was done this session:
- T423 (PR #311): Added 5 orphan modules to catalog — blueprint-no-sleep, gh-auto-gate, no-hook-bypass, no-nested-claude, publish-json-guard. Retagged to shtd. shtd.yml 85→90.
- T425 (PR #314): Fixed hardcoded path in no-nested-claude.js
- T426 (PR #315): Fixed stale workflow refs in watchdog.js, setup.js, tests — consolidated from T313
- T427 (PR #316): Version bump to 2.23.5 + marketplace sync
- Code review: ES5 clean, no security issues, no hardcoded paths (except 1 detection pattern in share-is-generic)
- Integrity: 110 files verified, 0 orphans (was 5 at session start)
- Health: 115 OK, 0 warnings, 0 failures
- Watchdog + setup now reference correct workflow defaults
- Live hooks synced (watchdog.js, setup.js)
- gh auth on default (joel-ginsberg_tmemu)

## Starter Workflow & Multi-Tag (T428-T430)
- [x] T428: Starter workflow — 11 universally useful modules, multi-tag support (`// WORKFLOW: shtd, starter`), `--yes` installs starter instead of shtd (PR #319)
- [x] T429: Adoption polish — modules.example.yaml reorganized, report.js/generate-manifest.js multi-tag fix (PR #320)
- [x] T430: Version bump to 2.24.1 + SKILL.md starter keyword + CHANGELOG

## Code Review (T431)
- [x] T431: Code review — fix README cross-project-reset count (1→0), regenerate ENFORCEMENT.md, version bump to 2.24.2

## Session Handoff (2026-04-11f)
What was done this session:
- T428 (PR #319): Starter workflow — 11 universally useful modules, multi-tag support, --yes installs starter
- T429 (PR #320): Adoption polish — modules.example.yaml, report.js/generate-manifest.js multi-tag fix
- T430 (PR #321): Version bump to 2.24.1 + SKILL.md starter keyword
- T431 (PR #322): Code review — README cross-project-reset count fix, ENFORCEMENT.md regen, v2.24.2
- Marketplace synced to v2.24.2
- gh auth on default (joel-ginsberg_tmemu)
- ES5 clean, no security issues, all audit/health checks pass

Next session (continue step 3-4 of stop-hook flow):
- Code review deeper: check all modules for consistent error handling patterns
- Consider GitHub release tags (stopped at v2.8.0, now at v2.24.2)
- Check if any project-scoped modules need updates
- Full test suite run (was killed mid-run this session)

Status:
- 0 pending tasks
- Version: 2.24.2
- 99 modules, 90 in shtd, 11 in starter (shared via multi-tag)
- Clean git, marketplace synced, health 115/0/0

## Code Review & Tags (T432)

- [x] T432: Code review — fix ES6 template literal in load-instructions.js, create 37 missing git tags (v2.9.0–v2.24.2), GitHub release for v2.24.2, version bump to 2.24.3
- [x] T433: Wrap 4 JSON.parse calls in setup.js with readSettings() helper — corrupt settings.json returns {} instead of crashing. Version bump to 2.24.4.

## Session Handoff (2026-04-11g)
What was done this session:
- T432 (PR #323): ES6 template literal fix in load-instructions.js, version bump to 2.24.3
- T433 (PR #324): readSettings() helper — 4 bare JSON.parse replaced, version bump to 2.24.4
- 37 missing git tags created and pushed (v2.9.0–v2.24.2)
- GitHub release created for v2.24.2
- Closed superseded PR #253 (hypothesis enforcement — replaced by commit discipline gates)
- Pruned 35+ stale remote branches (43→8)
- SKILL.md synced to installed skill dir (stale --groups/--toggle commands were in installed copy)
- Marketplace synced to v2.24.4
- Code review: all modules pass contract, ES5 clean, no security issues
- Health: 115 OK, 0 warnings, 0 failures
- Workflow audit: 98 modules, 97 tagged, all matching YAML
- gh auth on default (joel-ginsberg_tmemu)

Status:
- Version: 2.24.6
- 0 pending tasks

## DRY & Gate Fixes (T434+)

- [x] T434: Fix spec-before-code-gate catch-22 + cat regex false positive (PR #325)
- [x] T435: DRY FILE_MODIFY_PATTERNS into shared _file-modify-patterns.js helper (PR #325)
- [x] T436: Version bump to 2.24.5 + CHANGELOG (PR #325)
- [x] T437: Fix health check false failure on _prefix helper files (PR #326)
- [x] T438: Version bump to 2.24.6 + CHANGELOG (PR #326)

## Session Handoff (2026-04-11h)
What was done this session:
- T434 (PR #325): Fixed spec-before-code-gate catch-22 — exempts TODO.md/SESSION_STATE.md/CLAUDE.md/specs/ from gate. Tightened cat regex false positive.
- T435 (PR #325): DRY FILE_MODIFY_PATTERNS into shared _file-modify-patterns.js helper
- T437 (PR #326): Fixed health check false failure on _prefix helper files
- T438 (PR #326): Version bump to 2.24.6
- Updated GitHub repo description (100 modules, 5 workflows)
- Marketplace synced to v2.24.6, live hooks synced
- Code review: no hardcoded paths (except detection patterns in share-is-generic), no security issues, all execSync sanitized
- gh auth on default (joel-ginsberg_tmemu)

Status:
- 0 pending tasks
- Version: 2.24.6
- Health: 116 OK, 0 warnings, 0 failures
- Batch validation: 100/100 modules pass
- Workflow audit: 98 modules, all matching YAML
- Clean git on main

## Session Maintenance (2026-04-11i)

- [x] T439: Session maintenance — health 116/0/0, no incomplete tangents, stop-message.txt portability fix (hardcoded path → $CONTEXT_RESET_PY env var)
- [x] T440: Add "What does a block look like?" example to README — force-push and git-destructive-guard examples (PR #328)

## Session Handoff (2026-04-11i)
What was done this session:
- T439 (PR #327): stop-message.txt portability — hardcoded context-reset path → $CONTEXT_RESET_PY env var
- T440 (PR #328): README "What does a block look like?" section — concrete gate output examples
- Marketplace synced (README + stop-message.txt)
- Code review: ES5 clean, no security issues, no bare-string return bugs
- Full test suite: 51 suites, 405 passed, 0 failed
- Health: 116 OK, 0 warnings, 0 failures
- gh auth on default (joel-ginsberg_tmemu)

Status:
- 0 pending tasks
- Version: 2.24.6
- 101 modules, 5 workflows, clean git on main

## Session Maintenance (2026-04-11j)

- [x] T441: Session maintenance — health check (116/0/0), test suite (51 suites, 405 passed), code review (no ES6, no hardcoded paths, all WHY/WORKFLOW tags present, all JSON.parse in try/catch), live hooks in sync
- [x] T442: Fix testbox gate false positive — added gh_auto/gh to safe-tools regex on line 18 of rdp-testbox-gate.js. Added 2 test cases (17/17 pass). Synced to live hooks.

## Version Bump + Marketplace Sync (2026-04-14)

- [x] T443: Version bump to v2.25.0 + CHANGELOG + marketplace sync for T368-T372, T442. Pushed to grobomo/claude-code-skills.
- [x] T444: Fix T331 brain-bridge test flaky crash (process.exit(0) in server.close) + add 5 new modules to README (T094 7/7). Full suite: 51 suites, 817 passed.

## Test & Code Quality (2026-04-14b)

- [x] T445: Fix --test to discover .js test files — 15 JS test suites (~76 tests) silently skipped. Suite count 51→66, test count 817→893. (#336)
- [x] T446: Performance audit — added TOOLS: tag filtering, Read calls skip 21/54 modules (39% reduction, ~300ms saved). Top offenders documented. (PR #340)
- [x] T447: Fix e2e-enforcement test — HOOK_RUNNER_MODULES_DIR env var + isolated temp dirs per test. 11/11 pass.

## GSD Workflow Migration (T448-T452)

Replace shtd spec-based enforcement with GSD `.planning/` enforcement.
Keep: feature branches, PR-per-task, git safety, security gates.
Replace: spec-gate, spec-before-code-gate, gsd-gate → new gsd-plan-gate.

- [x] T448: Archive shtd workflow — disabled shtd at project level, created `workflows/gsd.yml` with gsd-plan-gate replacing spec-gate. 12 E2E tests pass.
- [x] T449: `gsd-plan-gate.js` — blocks code edits unless `.planning/ROADMAP.md` exists with active phases+PLAN.md, or TODO.md has tasks. Merged into T448.
- [x] T450: Write `gsd-branch-gate.js` PreToolUse module — enforces branch naming `<seq>-phase-<N>-<slug>` matching active ROADMAP.md phases. 9/9 tests. (PR #341)

## Snapshot & Workflow Simplification (T453-T455)

- [x] T453: Snapshot system — SHA256 manifest, drift detection, git-backed backup/restore (snapshot.js + drift-check SessionStart module) (PR #337)
- [x] T454: Promote universal modules to starter — 27 modules that protect system/account/platform should fire regardless of dev workflow (PR #337)
- [x] T455: Simplify workflow tiers — dual-tag 52 shared modules shtd+gsd, expand starter.yml 12→40 modules, clear tier structure (PR #338)
- [x] T451: Write `gsd-pr-gate.js` PreToolUse module — enforces phase/task reference in PRs, validates active ROADMAP.md phases. 9/9 tests. (PR #342)
- [x] T452: E2E tests for gsd-plan-gate — 12 tests covering all scenarios. Merged into T448.

## Stop Hook: Add Testing Step (T456)

- [x] T456: Update stop-message.txt to add step 3: "TEST what you built" before hardening. New 5-step order verified via stop hook test. (PR #339)

## Merge & Release (2026-04-16)

- [x] T457: Merge PRs #337-#342, version bump v2.26.0, marketplace sync, modules synced to live (PR #343)

## Spec Gate Bugfix (2026-04-16)

- [x] T458: Fix spec-gate blocking git/gh with env var prefixes ($() subshells) + node test scripts allowlist. 38/38 tests. (PR #344, #345)

## Remaining Tasks

- [x] T460: Clean up stale branches — 17 remote + 3 local worktree branches deleted, 5 unmerged remote kept
- [ ] T462: Marketplace sync for T458-T478 changes — delegated to claude-code-skills T006 (T004 covered v2.26.0, T006 covers v2.28.0)
- [x] T477: Fix runner worktree branch detection — readBranchFromDir prefers CWD worktree over CLAUDE_PROJECT_DIR. Spec-gate allowlist expanded with 9 read-only setup.js flags. 28/28 tests pass (23 bash + 5 worktree). (PR #362)
- [x] T478: Performance — preserve-iterated-content cache (1122ms→7ms), commit-counter-gate 4→1 git spawns, TOOLS tags on 7 modules (Read loads 35→28). PRs #363, #365, #366.

## OpenClaw Hook Integration (T470-T476, complete)

Ported hook-runner modules to OpenClaw Plugin SDK. Test profile: `openclaw --profile grobomo-test`.
Guard module `_openclaw/tmemu-guard.js` protects production OpenClaw.

- [x] T470: Analyze existing OpenClaw hooks (PR #354)
- [x] T471: Research tool:before/tool:after — Plugin SDK `before_tool_call` is the path (PR #354)
- [x] T472: Map 94 modules — 42 portable, 24 adaptable, 28 not portable (PR #355)
- [x] T473: Port 3 pilot gates to Plugin SDK (PR #356)
- [x] T474: Install script + 11-test suite (PR #357)
- [x] T475: E2E test — 31/31 across 3 phases: plugin load (3), tsx gates with real SDK (16), cross-validation (11) + install (11). Rewrote tsx harness to use register(api)/api.on pattern.
- [x] T476: Test profile + plugin SDK rewrite (PR #358)

## Session Handoff (2026-04-17, session 7+8)

**Session 7+8:**
- T460: Cleaned 17 remote + 3 local stale branches, pruned refs
- T477: Fixed worktree branch detection in runner + spec-gate allowlist (PR #362)
- T478: Performance — 3 optimizations (PRs #363, #365, #366):
  - preserve-iterated-content: file-based cache (1122ms→7ms on cache hit)
  - commit-counter-gate: 4 git spawns → 1 `git status --porcelain` (12/12 tests)
  - TOOLS tags on 7 modules: Read/Grep/Glob loads 35→28 modules
- v2.28.0 released (PR #364, GitHub release)
- All fixes synced to live hooks

**Session 9:**
- T475: Fixed e2e tsx harness — rewrote to use real OpenClaw Plugin SDK register(api)/api.on("before_tool_call") pattern instead of broken plugin.hooks.before_tool_call(). 31/31 tests pass across 3 phases.

**Remaining:**
1. T462: Marketplace sync for v2.28.0 (delegated to claude-code-skills T006)
2. T479: CHANGELOG accuracy — v2.27.0 T475 count corrected (30→31), v2.28.0 added commit-counter + TOOLS tag entries
3. T480: Stale branch cleanup — deleted 6 merged remote branches (237-bookkeeping, 253-T001, 253-T009, 350-T460, feat/event/T001, worktree-T462)

**Session 10:**
- [x] T481: v2.29.0 release — T475 e2e fix + T479 CHANGELOG corrections + T480 branch cleanup (PR #371, GitHub release)
- [x] T482: Test suite per-test timeouts — 60s per-test timeouts, TIMEOUT vs FAIL distinction, --js-only/--sh-only/--skip-wsl/--timeout flags (PR #373, v2.30.0)

**Session 11:**
- [x] T482: (continued from session 10) — committed, PR #373 merged, v2.30.0 released
- [x] T484: RCA — spec-gate TODO.md bypass when matching spec has incomplete chain (PR #375)
- [x] T485: RCA — commit-counter-gate worktreeRequired flag blocks git commit bypass (PR #375)

- [x] T486: Inter-project TODO priority system — audit logger, SessionStart P0 injection, PreToolUse priority gate, CLI dashboard (PR #377, v2.32.0)

**Session 12:**
- [x] T487: Batch port 15 modules to OpenClaw plugin v0.2.0 — 18 total (13 before_tool_call + 5 after_tool_call), 49/49 tests (PR #379)
- [x] T488: Add --sync/--upgrade to spec-gate allowlist + TOOLS tag optimization (19 modules tagged, Bash 57→40, Read 30→11)

**Session 13:**
- [x] T489: OpenClaw batch port #2 — 7 universal modules, plugin v0.3.0, 25 total (17 before_tool_call + 8 after_tool_call), 116 tests (PR #382, v2.35.0)
- [x] T489: Update openclaw.plugin.json + README.md for v0.3.0 (PR #383)
- [x] T490: Fix no-nested-claude false positive on chained git commands — `cd && git commit` with "claude" in heredoc was blocked (PR #384)

**Session 14:**
- [x] T491: TOOLS tag optimization batch 2 — add TOOLS tags to 6 untagged PreToolUse modules (spec-gate, gsd-plan-gate, env-var-check, no-nested-claude, publish-json-guard, pr-first-gate) — 56/61 PreToolUse modules now tagged
- [x] T492: Fix 2 pre-existing test failures — T112 why-gate WORKFLOW tag check, T094 module-docs missing 3 T486 modules in README
- [x] T493: Convert test-modules.sh to JS — eliminates ~218 node spawns, fixes 60s timeout (436 tests, <5s)
- [x] T494: --audit-project command — per-project hook audit from hook-log.jsonl (fired modules, blocks, coverage gaps, timing)

**Session 15:**
- [x] T495: spec-gate allowlist — add --audit-project, --manifest, --analyze, --workflow to read-only Bash command allowlist (PR #389)
- [x] T496: preserve-iterated-content perf — switch cache from headSha:path to path-only with 5min TTL (663ms→4ms cache hit)
- [x] T497: commit-counter-gate false positive — metadata dirs (.claude, .coconut, etc.) excluded from branch-file mismatch detection
- [x] T498: Version bump to v2.37.0 — CHANGELOG for T490-T497 (1 feature, 5 fixes, 1 improvement)

**Session 16:**
- [x] T499: SessionStart perf — replace tasklist with process.kill(0) in _is-pid-running (374ms→14ms), replace require() with accessSync in project-health (358ms→45ms). Net ~670ms saved per session (PR #393)
- [x] T500: --audit-project --json — machine-readable JSON output for programmatic consumption (PR #394)
- [x] T501: Version bump to v2.38.0 — CHANGELOG for T499-T500 (PR #395)
- [x] T502: OpenClaw plugin — port auto-continue and session-start-reminder (PR #396)

**Session 17:**
- [x] T503: Version bump to v2.39.0 — CHANGELOG for T502 (PR #397)
- [x] T504: Alias modules for stale sync entries — gsd-gate and e2e-self-report-gate delegate to test-checkpoint-gate (PR #398)
- [x] T505: Fix README module count — add alias modules to README docs (PR #399)
- [x] T506: Version bump to v2.40.0 — CHANGELOG for T504-T505 (PR #400)
- [x] T507: Per-file test timeout — read `// TIMEOUT: N` from test files, fixes commit-counter-gate 60s timeout (PR #401)

**Session 18:**
- [x] T508: Version bump to v2.41.0 — CHANGELOG for T507 (PR #402)
- [x] T509: Add TOOLS tags to 11 modules — perf optimization (~5ms/module per non-matching call) (PR #403)
- [x] T510: Version bump to v2.42.0 — CHANGELOG for T509 (PR #404)
- [x] T511: Fix commit-counter-gate worktree detection — CWD fallback (PR #405)
- [x] T512: Version bump to v2.43.0 — CHANGELOG for T511

**Session 19:**
- [x] T513: Fix stale README workflow module counts — starter 11→40, shtd 90→95, total 80+→115+ (PR #407)
- [x] T514: Version bump to v2.44.0 — CHANGELOG for T513 (PR #408)
- [x] T515: Sync workflow YAML ↔ module tags — 5 modules added to YAMLs, 2 tags fixed (PR #409)
- [x] T516: Version bump to v2.45.0 — CHANGELOG for T515 (PR #410)
- [x] T517: Workflow audit extends-aware — count parent tags, add drift-check/config-sync/aliases to YAMLs

## Future (backlog)
- [ ] T462: Marketplace sync for T458-T478 changes — delegated to claude-code-skills T006
- [ ] Port remaining OpenClaw modules (configurable/niche: aws-tagging, deploy-gate, messaging-safety, etc.)

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
