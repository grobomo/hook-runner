# Changelog

All notable changes to hook-runner are documented here.

## [2.4.2] — 2026-04-05

### Improved
- `--perf` labels removed/archived modules with `[removed]` and excludes them from overhead estimates (#138)

### Fixed
- Remove unused `hasAsync` variable from run-async.js (#138)

## [2.4.1] — 2026-04-05

### Improved
- branch-pr-gate: defer `getBranch()` git subprocess until after state-change check — saves ~150ms for non-state-changing Bash commands (#136)

### Added
- Test suite for `--test-module` command (9 tests covering usage, errors, all event types, custom input) (#136)

## [2.4.0] — 2026-04-05

### Added
- `--test-module <path>` command — test a single module with sample inputs, supports `--input <json>` for custom test data (#134)

### Fixed
- Workflow YAML/tag mismatches: dispatcher-worker 9→1, cross-project-reset 0→1, shtd 17→16 (#133)
- Removed empty enforce-shtd.yml workflow (0 modules, dead placeholder) (#133)

## [2.3.2] — 2026-04-05

### Fixed
- Per-suite test timeout increased from 60s to 120s — prevents false failures under load (#128)
- `--test` now names which suites failed in summary line (#130)
- `--test` prints `FAIL: suite crashed (exit code N)` when a suite crashes (#130)

## [2.3.1] — 2026-04-05

### Fixed
- watchdog.js converted from ES6 to ES5 for consistency with all other files (#126)
- Cron install/uninstall: replaced `execSync echo pipe` with `execFileSync stdin` to prevent shell injection from crontab content (#126)

## [2.3.0] — 2026-04-05

### Added
- Windows CI job (`windows-latest`) — cross-platform validation on every push (#123)
- "Why hook-runner?" philosophy section in README — raw hooks → modules → workflows (#124)
- Integration guide in README — context-reset, skill-maker, mcp-manager, marketplace (#124)

### Fixed
- `grep -P` (Perl regex) replaced with portable `grep -o` / `sed` in 3 test scripts (#123)

## [2.2.3] — 2026-04-05

### Fixed
- workflow.js converted from ES6 to ES5 for consistency with all other files (#120)
- `require("path")` moved from inner function to module level in run-async.js (#120)
- Missing `--confirm` flag added to `--help` output (#120)

### Changed
- Module header cache in load-modules.js — each file read once instead of twice per invocation (#121)

## [2.2.2] — 2026-04-05

### Fixed
- config-sync: detect and remove stale git `index.lock` (>60s) before `git add` (#115)
- config-sync: push current branch instead of hardcoded `main` (#115)
- archive-not-delete: allow `rm .git/*.lock` for standard git recovery (#116)

### Added
- Module behavior test suite: 15 tests for archive-not-delete exceptions + config-sync logic (#117)

## [2.2.1] — 2026-04-05

### Fixed
- PreToolUse runner now normalizes Windows backslash paths (#109)

### Added
- 4 modules synced to catalog: disk-space-guard, settings-hooks-gate, task-completion-gate, chat-export (#110)

### Changed
- Workflow YAML module lists synced with actual tagged modules (#111)

## [2.2.0] — 2026-04-05

### Added
- `--workflow create` generates YAML + optional module stubs (#89)
- `--workflow add-module` creates module with WORKFLOW tag + WHY stub (#89)
- `--workflow sync-live` copies all workflow YAMLs + tagged modules to live (#89)
- Duplicate module detection in health check (#104)
- "Write Your First Module" tutorial in README (#99)
- CI npx install test (#97)
- Hook editing enforcement gate (#96)
- E2e fresh install test (#94)
- Hook system watchdog with scheduled health checks and auto-repair (#92)

### Changed
- Extracted `cmdWorkflow` into `workflow-cli.js` (setup.js 2041→1598 lines) (#106)
- README workflow table updated with all 10 workflows (#102)
- Watchdog required list includes split workflows (#103)
- `--list` excludes archive/ from project-scoped scan (#105)
- Fixed 34 workflow tag mismatches (#101)

## [2.1.0] — 2026-04-04

### Added
- Workflow audit command — coverage report, orphan detection (#98)

### Changed
- Audit fixes — workflow-gate tag, gitignore cleanup (#98)

## [2.0.0] — 2026-04-04

### Breaking
- All modules use portable paths (no hardcoded `/c/Users/...` paths)
- Requires Node.js with `path` module (always available)

### Added
- Relaxed SHTD gates — TODO.md accepted as task source, auto-detect test scripts (#95)
- Dispatcher/worker workflow for fleet operations (#95)
- Cross-project drift detector module (#90)
- Portable paths health check validation (#93)
- Uninstall with `--confirm` restores backup (#91)
- `--yes` flag for non-interactive setup (#91)

### Changed
- All modules rewritten for portability — no hardcoded paths (#90, #91)
- README fully rewritten with troubleshooting guide (#91)
- CLAUDE.md and SKILL.md updated (#91)

## [1.6.0] — 2026-04-03

### Added
- Workflow engine as first-class feature with YAML state machine (#66)
- `--workflow` CLI: list, enable, disable, start, status, complete, reset (#84)
- `--workflow audit` for coverage reports (#85)
- `--workflow query <tool>` shows which workflows affect a tool (#86)
- Workflow-summary SessionStart module for context resets (#87)
- `modules:` field in workflow YAMLs (#82)
- Workflow enable/disable config (global + per-project) (#83)
- Built-in workflows: shtd, code-quality, infra-safety, messaging-safety, no-local-docker (#69-#71, #82)
- `--export` command for shareable module config (#67)
- `--perf` command for module timing analysis (#64)
- why-reminder PreToolUse gate (#88)

### Changed
- All modules tagged with `// WORKFLOW: name` (#83)
- Workflow files synced to live hooks (#72)

## [1.5.1] — 2026-04-02

### Fixed
- Health check no longer scans archive/ dirs (#75, #81)
- Shell input sanitization to prevent command injection (#76)
- Live module sync — fixed return-type bugs in load-lessons, drift-review (#74)
- Test timeout reduced from 85s to 5s (#75)

### Added
- `package.json` for `npx grobomo/hook-runner` install (#77)
- CLAUDE.md with accurate test counts and file layout (#79)
- Complete Available Modules table in README (#80)

## [1.5.0] — 2026-04-02

### Added
- Workflow engine (`workflow.js`) with YAML state machine and gate validation (#66)
- `workflow-gate.js` PreToolUse module — enforces workflow step order (#68)
- `shtd.yml` workflow manifest grouping spec/gsd/branch/remote gates (#69)
- `no-local-docker.yml` workflow + block-local-docker module (#70)
- `messaging-safety.yml` workflow + messaging guard module (#71)

### Changed
- Module filtering respects workflow enabled state (#68)
- Workflow files synced to live hooks, skill, and marketplace (#72)

## [1.4.0] — 2026-04-01

### Added
- `env-var-check` PreToolUse module (#58)
- Per-module timing in hook-log (#59)
- Timing visualization in HTML report (#60)
- Module dependency system with `requires:` header (#61)

### Changed
- Live module fixes synced back to repo catalog (#57)

## [1.3.0] — 2026-04-01

### Added
- `project-health` SessionStart module (#53)
- `test-coverage-check` PostToolUse module (#54)

### Changed
- Extracted `main()` dispatch into command handler functions (#55)

## [1.2.0] — 2026-04-01

### Added
- `--upgrade` command (self-updater from GitHub) (#50)
- `--open` flag for reports (#50)
- `no-hardcoded-paths` PreToolUse module (#49)

### Changed
- Extracted report generator into `report.js` (#48)

## [1.1.0] — 2026-03-31

### Added
- `--help` command (#47)
- `--test` CLI command to run all test suites (#44)
- `--uninstall` CLI command (#45)
- `--list` command for catalog vs installed comparison (#41)
- `--stats` command for text summary of hook log (#38)
- `commit-message-check` PostToolUse module (#46)
- `secret-scan-gate` PreToolUse module (#36)
- `prompt-logger` UserPromptSubmit module (#40)
- UserPromptSubmit runner (#37)
- GitHub Actions CI with test + secret-scan workflows (#35)
- `--prune` command for log rotation (#33)
- `--version` flag (#33)

### Changed
- Module validation test loads + calls every module (#39)
- CI badge added to README (#36)

## [1.0.0] — 2026-03-30

### Added
- Setup wizard: scan → report → backup → install → verify (#5)
- HTML report with flow diagram, expandable modules, search (#9, #22)
- Module catalog with 15+ modules organized by event type (#13)
- YAML config for module selection (#13)
- `--sync` command to fetch modules from GitHub (#13)
- Hook logging with stats in report (#15)
- Health check command (#18)
- Async module support with 4s timeout (#19)
- Report v2: standalone hooks, search/filter, block-only stats (#22)
- Backup-check async SessionStart module (#21)
- SKILL.md and marketplace plugin (#8)
