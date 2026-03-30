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
- [ ] T063: Add --upgrade command (self-updater from GitHub)

## Status
- 60 tasks completed, 3 pending
- Version: 1.1.0
- 84 tests passing across 5 test files (16 runner + 7 wizard + 13 async + 38 module + 10 sync)
- CI: GitHub Actions runs all tests on push/PR — badge in README
- 4 sync targets all identical: repo, live hooks, skill, marketplace
- 19 modules in catalog (12 PreToolUse, 2 PostToolUse, 1 UserPromptSubmit, 2 SessionStart, 2 Stop)
- CLI commands: setup, report, dry-run, health, sync, stats, list, test, uninstall, prune, version, help

## Session Handoff (2026-03-30)
Completed T055-T060 this session. Project is v1.1.0, very mature (60 tasks, 82 tests, 18 modules, 13 CLI commands).

### What was done
- T055: `--test` command runs all 5 test suites
- T056: `--uninstall` command with --dry-run and --force options
- T057: `commit-msg-check` PostToolUse module (blocks WIP/fixup, >72 char lines)
- T058: Marketplace sync for all new features
- T059: README updated with new commands and module
- T060: `--help` command + version bump to 1.1.0

### Nothing broken
All 82 tests pass locally and in CI. All 4 sync targets identical.

### Next session ideas (prioritized by impact)
1. **Code review of setup.js** — 1840+ lines, could extract report generation into separate file for maintainability
2. **PreToolUse module: `no-hardcoded-paths`** — blocks Write/Edit with absolute paths (common antipattern)
3. **`--upgrade` command** — pull latest setup.js from GitHub and replace local copy (self-updater)
4. **Integration with hook-flow-bundle** — export/import module configs as portable bundles
5. **Module dependency system** — some modules logically depend on others (spec-gate needs enforcement-gate)

## Moved
- T026: Moved to chat-export/TODO.md (out of scope for hook-runner)

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
