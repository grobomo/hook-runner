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

## Status
- 206 tasks completed, 0 pending
- Version: 2.5.5 (released, tagged, marketplace synced, live hooks synced)
- Clones: 2055 total, 0 stars/forks/issues — stable utility, no community demand for features
- 532 tests passing across 40 test suites
- CI: GitHub Actions runs tests + secret-scan on push/PR — badge in README
- Workflow engine: workflow.js + workflow-gate.js + 9 built-in workflow templates
- CLI commands: setup, report, dry-run, health, sync, stats, list, test, upgrade, uninstall, prune, version, help, workflow (list/audit/query/enable/disable/start/status/complete/reset/create/add-module/sync-live), perf, export

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

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
