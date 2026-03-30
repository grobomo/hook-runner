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

## Gate Fixes (in ~/.claude/hooks/run-modules/PreToolUse/)
These were made to the live hooks, not committed to this repo (user-specific enforcement):
- **continuous-claude-gate.js**: Renamed to "Tracked Workflow Gate". Removed CONTINUOUS_CLAUDE=1 env bypass. Added bootstrap allowlist (.gitignore, .json, ~/.claude/). Generic dev-team language with WHY reasoning.
- **spec-gate.js**: Generic dev-team language, kept WHY reasoning.
- **branch-pr-gate.js**: Generic language. Added rebase/merge/cherry-pick --abort and gh pr close/view/list as allowed repair operations.
- **root-cause-gate.js**: Removed rebase/merge --abort from cleanup patterns — they're recovery, not symptoms.
- **remote-tracking-gate.js**: Fixed tool_input parsing to handle object (not just JSON string).

## Active
- [x] T014: Sync repo example modules with live fixes
- [x] T015: Sync local skill copy after repo changes
- [x] T016: Module catalog — move all modules into repo under modules/ directory
- [ ] T017: Config file — modules.yaml format to pick which modules to install
- [ ] T018: Sync command — `setup.js --sync` pulls selected modules from GitHub
- [ ] T019: Update SKILL.md/README with sync workflow, test e2e on fresh install

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
