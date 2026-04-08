# Tasks: Hypothesis Enforcement Hooks

- [x] T001: Build `hypothesis-throttle.js` (PreToolUse:Bash, ddei-email-security scoped) (PR #253)
- [x] T002: Build `hypothesis-failure-tracker.js` (PostToolUse:Bash, ddei-email-security scoped) (PR #253)
- [x] T003: Build `no-prose-enforcement.js` (PreToolUse:Write/Edit, global) (PR #253)
- [x] T004: Unit tests for all four modules (25 tests, all pass) (PR #253)
- [ ] T005: Integration test in ddei-email-security project (run e2e-test.sh, verify throttle fires)
- [ ] T006: Add to modules.yaml (project_modules for ddei, global for prose gate)
- [x] T007: Hook crash visibility — already handled: run-async.js catch block → handleResult(error) → hookLog.logHook("error") + stderr (PR #253)
- [x] T008: Migrate report-review-gate.js to hook-runner module (modules/Stop/ddei-email-security/report-review-gate.js). Fixed: hardcoded path → CLAUDE_PROJECT_DIR, relative command → module system, cwd check → env var, ES6 → ES5. (PR #253)
- [ ] T009: Build `hook-creation-detector.js` (PostToolUse:Write, global) — detect hook-like code written outside hook-runner, write cross-project TODO
- [ ] T010: Strengthen `hook-editing-gate.js` — catch settings.local.json hooks section additions with actionable hook-runner guidance
