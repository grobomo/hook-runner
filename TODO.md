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

## Active
- [x] T022: Centralized hook logger — JSONL log of every module trigger with context
- [x] T023: Stats reader — parse log, compute per-module counts + sample triggers
- [x] T024: Report integration — show counts inline, expandable examples per module
- [x] T025: Update runners to log, sync all copies, test e2e

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
