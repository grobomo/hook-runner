# Setup Wizard — Tasks

## Phase 1: Project Sync
- [x] T001: Sync repo runners with live system (load-modules.js, updated runners)
- [x] T002: Add .gitignore and secret-scan CI

**Checkpoint**: `bash scripts/test/test-runners.sh` — verify runners load modules correctly

---

## Phase 2: Setup Wizard Core
- [x] T003: Build hook scanner (reads settings.json, resolves scripts, categorizes)
- [x] T004: Build HTML report generator (styled report showing current hooks)
- [x] T005: Build backup engine (archive existing hooks before changes)
- [x] T006: Build installer (copy runners, create dirs, update settings.json)
- [x] T007: Build setup.js orchestrator (scan → report → preview → confirm → backup → install → verify)

**Checkpoint**: `bash scripts/test/test-setup-wizard.sh` — run setup in dry-run mode, verify report + backup + install

---

## Phase 3: Skill & Marketplace
- [x] T008: Create SKILL.md for hook-runner skill
- [x] T009: Create marketplace plugin entry in grobomo/claude-code-skills
- [x] T010: Update README.md with setup wizard docs

**Checkpoint**: `bash scripts/test/test-skill-install.sh` — verify skill installs and setup.js runs
