# hook-runner — Project Tracking

## Overview
Modular hook runner system for Claude Code. One runner per event, modules in folders.
- Repo: grobomo/hook-runner (public)
- Marketplace: trend-ai-taskforce/ai-skill-marketplace → plugins/hook-runner
- Local skill: ~/.claude/skills/hook-runner/
- Live hooks: ~/.claude/hooks/ (run-*.js, load-modules.js, run-modules/)

## Current State (v2.73.0)
- 121 modules, 7 workflows, 162 test suites, ~2460 tests
- 100% test coverage across all event types + helpers
- PRs: 509 merged

## Open Tasks
- [ ] T578: Marketplace sync v2.64.0 → v2.73.0 — TODO written to ai-skill-marketplace. Needs user permission to push PR to trend-ai-taskforce.
- [ ] T607: Add T605/T606 modules to README table + version bump to v2.73.0
- [x] T596: Project health — archived 468 completed tasks + 5 stale handoffs to TODO-COMPLETED.md (1468→35 lines).
- [x] T597: Remove broken UserPromptSubmit hook from lab-worker settings.json — already fixed (was `{"hooks": {}}`)
- [x] T598: Improve hook-editing-gate.js block message with actionable 3-step instructions. Both Bash bypass and Edit/Write blocks updated. Test added (17 tests).
- [x] T604: Hook diagnostics — `node setup.js --diagnose [project-dir]`. Settings resolution, hook validation, --fix, --json. 10+21 tests. (PR #509)
- [x] T603: User correction detector — PostToolUse module, prompt-log.jsonl real-time, strong/moderate patterns, dedup, correction-log.jsonl. 61 tests. (PR #508)
- [x] T605: automate-everything-gate — blocks manual lint/check commands, forces CI/CD pipeline. 27 tests.
- [x] T606: no-lessons-file-gate — blocks writes to lessons.jsonl, forces hook module creation. 11 tests.
- [ ] (deferred) Port remaining OpenClaw modules (configurable/niche: aws-tagging, deploy-gate, messaging-safety, etc.)

## Session Handoff (2026-05-04, session 8 continued)
- T605: automate-everything-gate — blocks flake8/pylint/mypy/ruff/shellcheck/semgrep/eslint/prettier/PSScriptAnalyzer/py_compile. Allows script wrappers. 27/27 tests.
- T606: no-lessons-file-gate — blocks Edit/Write/Bash to lessons.jsonl. Forces hook module creation. 11/11 tests.
- Fixed spec-before-code-gate bug: git log ran in cwd instead of CLAUDE_PROJECT_DIR. 20/20 tests.
- Fixed hook-system-reminder: now allows edits from hook-runner project + .yaml config files. 13/13 tests.
- Added no-infra-excuse + user-correction-detector to live modules.yaml.
- README updated with 2 new PostToolUse modules (T094 test now passes).
- Stale worktrees: cleaned t602. t597 has uncommitted work (leave). t604 locked by AV.
- **Next**: Version bump, marketplace sync (T578 needs user permission), add T605/T606 to modules.yaml + README.

## Session Handoff (2026-05-04, session 8)

## Session Handoff (2026-05-04, session 7)
- T597: Already done — lab-worker settings.json was already `{"hooks": {}}`.
- T598: Updated hook-editing-gate.js error messages in both Bash bypass (line 114-116) and Edit/Write project-lock (line 150-152) blocks with actionable 3-step instructions (write TODO, launch session, auto-execute). Added test #16 verifying actionable content. 17/17 tests pass.

## Session Handoff (2026-05-03, session 6)
- v2.70.0 released. 158 suites, ~2340 tests. 118 modules, 7 workflows.
- PRs #505-#506 merged (T594-T595): helper tests + version bump.
- **100% test coverage**: PreToolUse (all + helpers), PostToolUse 15/15, Stop 13/13, SessionStart 14/14.
- GitHub releases created for v2.68.0, v2.69.0, v2.70.0.
- T578 marketplace sync: TODO written to ai-skill-marketplace/TODO.md. Needs user permission.
- Perf analysis: PreToolUse ~492ms/call across 63 modules. No single hot spot — distributed across many ~6ms modules. 5 modules missing TOOLS tags are intentionally tool-agnostic.
- TODO.md archived from 1468 lines to ~50 lines (completed items moved to TODO-COMPLETED.md).

## Architecture Notes
- Repo contains the generic/distributable runner system + module catalog
- `modules/` has all available modules organized by event type
- `~/.claude/hooks/modules.yaml` controls which modules are installed locally
- `setup.js --sync` fetches modules from GitHub and installs them
- Project-scoped modules go in `modules/PreToolUse/<project-name>/` in the repo
- Completed task history: see TODO-COMPLETED.md
