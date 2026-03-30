# hook-runner — Project Tracking

## Overview
Modular hook runner system for Claude Code. Already built and deployed at `~/.claude/hooks/`.
This repo tracks development, publishes to grobomo GitHub, and provides a marketplace skill with setup wizard.

## Tasks

- [x] T001: Create specs and project structure
- [x] T002: Sync repo runners with live system (load-modules.js)
- [x] T003: Build setup.js wizard (scan → report → backup → install → verify)
- [x] T004: Create marketplace plugin entry in grobomo/claude-code-skills
- [x] T005: Update README.md and push all to grobomo/hook-runner
- [x] T006: Install skill locally and test end-to-end

## Also Done (gate improvements)
- [x] Fixed continuous-claude-gate.js → renamed to "Tracked Workflow Gate", removed CONTINUOUS_CLAUDE=1 bypass, added bootstrap detection
- [x] Fixed spec-gate.js, branch-pr-gate.js — replaced hackathon-specific language with generic dev-team language, kept WHY reasoning
- [x] T011: Upgraded report — flow diagram, expandable modules with source code, consistent terminology, event ordering
- [x] Fixed report chevron on left side, fixed double line spacing in code blocks

## Session State
- On branch: 001-T006-local-test (has uncommitted PR #7 open: 001-setup-wizard → main)
- PR #7 still OPEN — needs merge to main
- grobomo account must be active for pushes (`gh auth switch --user grobomo`)
- Marketplace (grobomo/claude-code-skills) already synced with latest setup.js
- Local skill at ~/.claude/skills/hook-runner/ already synced

## Remaining Work
- [ ] Merge PR #7 (feature branch → main)
- [ ] Clean up stale branches (001-T001-sync-source, 001-T003-setup-wizard, 001-T006-local-test, 001-T008-marketplace)
- [ ] Review: the gate files were edited in ~/.claude/hooks/run-modules/PreToolUse/ but NOT committed to this repo — the repo only has example modules. Consider whether to sync the live gate modules into the repo or keep them separate (user-specific vs generic)
- [ ] The `remote-tracking-gate.js` and `push-unpushed.js` modules exist in live but aren't in the repo — document or add them
- [ ] CLAUDE.md in this repo needs updating — it still references the old hook-manager pattern
