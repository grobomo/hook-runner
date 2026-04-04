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

## Status
- 92 tasks completed, 0 pending
- Stale remote branches cleaned (9 deleted)
- Next: consider installer improvements, npm packaging
- Version: 1.5.1
- 172 tests passing across 10 test files
- CI: GitHub Actions runs all tests on push/PR — badge in README
- Workflow engine: workflow.js + workflow-gate.js + 5 built-in templates
- CLI commands: setup, report, dry-run, health, sync, stats, list, test, upgrade, uninstall, prune, version, help, workflow, perf, export

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

## Moved
- T026: Moved to chat-export/TODO.md (out of scope for hook-runner)

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
