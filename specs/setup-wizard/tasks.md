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

---

## Phase 4: Report Improvements
- [x] T011: Add flow diagram, expandable modules with source code, consistent terminology, event ordering

**Checkpoint**: `bash scripts/test/test-setup-wizard.sh` — verify report generates correctly

---

## Phase 5: Cleanup & Documentation
- [x] T013: Clean TODO.md, delete stale branches, archive SESSION_STATE.md, document gate fixes
- [x] T014: Sync repo example modules with live fixes
- [x] T015: Sync local skill copy after repo changes

**Checkpoint**: `bash scripts/test/test-runners.sh && bash scripts/test/test-setup-wizard.sh`

---

## Phase 6: Module Catalog & Sync
- [ ] T016: Move all modules into repo under modules/ directory (organized by event, with metadata)
- [ ] T017: Config file — modules.yaml format to select which modules to install
- [ ] T018: Sync command — `setup.js --sync` fetches selected modules from GitHub raw content
- [ ] T019: Update SKILL.md/README, add sync custom command, test e2e fresh install

**Checkpoint**: `bash scripts/test/test-module-sync.sh` — verify sync installs selected modules from config
