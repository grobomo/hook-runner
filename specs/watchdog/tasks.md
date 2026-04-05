# Watchdog — Tasks

## Phase 1: Core watchdog script

- [ ] T122: Build watchdog.js — checks workflow config, runners, modules, settings. JSON output. Auto-repairs disabled workflows. Writes .watchdog-alert flag on failure. Logs to watchdog-log.jsonl.
- [ ] T123: Build watchdog-config.json — declares healthy state (required workflows, runners, modules). Ships with sensible defaults.
- [ ] T124: Fix T205 test — use project-scoped temp dir instead of --global, stop sabotaging workflow-config.json

**Checkpoint**: `bash scripts/test/test-T122-watchdog.sh` — verify watchdog detects disabled shtd, auto-repairs, creates alert flag

---

## Phase 2: Scheduler integration

- [ ] T125: Add --install command — registers OS scheduled task (schtasks/launchd/cron). VBS wrapper for Windows. Every 10 min.
- [ ] T126: Add --uninstall command — removes scheduled task cleanly
- [ ] T127: Add --status command — shows if scheduler is registered + last run result

**Checkpoint**: `bash scripts/test/test-T125-scheduler.sh` — verify install/uninstall/status work on current platform

---

## Phase 3: SessionStart alert integration

- [ ] T128: Update project-health.js SessionStart module to read .watchdog-alert and inject warning into Claude context
- [ ] T129: Add --log command — show recent watchdog events (healthy/repaired/broken)

**Checkpoint**: `bash scripts/test/test-T128-alert-integration.sh` — verify alert flag triggers SessionStart warning
