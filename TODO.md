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
