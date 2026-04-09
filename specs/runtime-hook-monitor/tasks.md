# Runtime Hook Health Monitor — Tasks

- [x] T390a: Add invocation logging to run-hidden.js (JSONL to hook-health.jsonl)
- [x] T390b: Create hook-health-monitor.js PostToolUse module (5 anomaly checks)
- [x] T390c: Write failing tests for all 5 failure modes + happy path
- [ ] T390d: Add hook-health.jsonl to prune rotation in setup.js
- [x] T390e: Sync to live hooks and verify end-to-end
- [ ] T390f: Add checkHealthLog() to watchdog.js — 5 runtime checks on hook-health.jsonl
- [ ] T390g: Add Windows toast notification to watchdog on failure
- [ ] T390h: Auto-install watchdog scheduled task in setup.js
- [ ] T390i: Write failing tests for watchdog health log checks
- [ ] T390j: Install watchdog task and verify it runs
