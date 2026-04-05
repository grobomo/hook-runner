# Publish-Ready — Tasks

## Phase 1: Clean (remove hardcoded paths)

- [x] T201: Audit + fix cwd-drift-detector.js — replace hardcoded ProjectsCL1 path with os.homedir() + configurable projects root
- [x] T202: Audit + fix config-sync.js — replace hardcoded paths with env/homedir resolution
- [x] T203: Audit + fix claude-p-pattern.js, no-passive-rules.js — same treatment
- [x] T204: Add portable-paths test — verify `grep -rn 'C:\\Users' modules/` returns 0 hits (exclude test fixtures)

**Checkpoint**: `bash scripts/test/test-T204-portable-paths.sh` — scans all modules for hardcoded user paths, exits 0 if clean

---

## Phase 2: Harden (onboarding + uninstall + CI)

- [x] T205: Setup wizard — add "Enable default workflows?" prompt (shtd + messaging-safety), auto-enable on `--yes`
- [x] T206: Uninstall restore — `--uninstall --confirm` restores settings.json from most recent archive/ backup
- [ ] T207: Health check — add portable-paths validation (flag modules with hardcoded absolute paths)
- [x] T208: CI test.yml — run `node setup.js --test` instead of individual scripts (covers all 28+ suites)
- [ ] T209: Add CI install test — fresh `npx grobomo/hook-runner --yes` in CI to verify onboarding works

**Checkpoint**: `bash scripts/test/test-T205-onboarding.sh` — verify setup wizard enables workflows when --yes flag used

---

## Phase 3: Document (README rewrite)

- [x] T210: README rewrite — lead with "What is hook-runner?", workflows as primary concept, modules as implementation
- [x] T211: Add troubleshooting section — common errors, debug steps, how to check logs
- [x] T212: Update CLAUDE.md — accurate test counts, new task numbers, architecture section
- [x] T213: Update SKILL.md — workflow commands, all CLI commands, updated keywords

**Checkpoint**: `bash scripts/test/test-T094-module-docs.sh` — all modules documented in README

---

## Phase 4: Ship (publish v2.0.0)

- [ ] T214: Version bump to 2.0.0 in setup.js + package.json + SKILL.md
- [ ] T215: Sync to marketplace (claude-code-skills/plugins/hook-runner/)
- [ ] T216: Final e2e — clone fresh, `npx grobomo/hook-runner --yes`, verify workflows active, run `--health`

**Checkpoint**: `bash scripts/test/test-T216-e2e-fresh-install.sh` — simulates clean install in temp dir
