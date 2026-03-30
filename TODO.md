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

## Status
All tasks complete. Project is mature and stable:
- 37 tasks completed, 0 pending
- 33 tests passing (14 runner + 6 wizard + 13 async)
- 4 sync targets all identical: repo, live hooks, skill, marketplace
- Report works for both hook-runner users and standalone hooks users
- Next session: marketplace promotion, demo recording, or new module development

## Moved
- T026: Moved to chat-export/TODO.md (out of scope for hook-runner)

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
