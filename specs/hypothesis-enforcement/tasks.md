# Tasks: Hypothesis Enforcement Hooks

- [ ] T001: Build `hypothesis-throttle.js` (PreToolUse:Bash, ddei-email-security scoped)
- [ ] T002: Build `hypothesis-failure-tracker.js` (PostToolUse:Bash, ddei-email-security scoped)
- [ ] T003: Build `no-prose-enforcement.js` (PreToolUse:Write/Edit, global)
- [ ] T004: Unit tests for all three hooks (mock input, verify block/allow)
- [ ] T005: Integration test in ddei-email-security project (run e2e-test.sh, verify throttle fires)
- [ ] T006: Add to modules.yaml (project_modules for ddei, global for prose gate)
- [ ] T007: Hook crash visibility — runner must log errors to hook-log.jsonl when hooks throw
- [ ] T008: Migrate report-review-gate.js from ddei settings.local.json to hook-runner module system (run-modules/Stop/ddei-email-security/report-review-gate.js), remove Stop hook section from settings.local.json
