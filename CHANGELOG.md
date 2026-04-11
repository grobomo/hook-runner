# Changelog

All notable changes to hook-runner are documented here.

## [2.23.3] — 2026-04-11

### Fixed
- **Untracked run-modules/ from git** (T368) — Directory was in `.gitignore` but still tracked, causing 46+ phantom dirty files every session. Removed from tracking without deleting live files.
- **README module catalog** (T369) — Added 5 missing modules (commit-counter-gate, commit-quality-gate, deploy-gate, deploy-history-reminder, spec-before-code-gate). Updated shtd workflow count from 69 to 83.
- **package.json files array** (T370) — Added preflight.js, generate-manifest.js, run-stop-bg.js to `files` array so they're included in npx installs.

## [2.23.2] — 2026-04-11

### Security
- **execSync→execFileSync** (T366, T366b) — Converted all shell-interpolated `execSync` calls to `execFileSync` with args arrays across 7 modules (push-unpushed, pr-first-gate, drift-review, config-sync, hook-autocommit, _is-pid-running). Eliminates shell interpretation as defense-in-depth. Only `claude -p` calls remain (need shell for stdin piping, no interpolation).

## [2.23.1] — 2026-04-11

### Fixed
- **deploy-history-reminder silent discard** (T363) — Module returned `{text: "..."}` but PreToolUse runner only checks `result.decision`. Advisory was never shown. Writes to stderr now. DEPLOY_PATTERNS aligned with deploy-gate (5→10).
- **Runner {text} advisory handling** (T363) — Added `{text}` output to run-stop-bg.js and run-posttooluse.js so advisory modules (config-sync, drift-review, hook-health-monitor) are visible.
- **commit-quality-gate heredoc parsing** (T364) — Simple `-m "msg"` regex matched before heredoc pattern, extracting `$(cat <<` as the message. Fixed by checking heredoc first.

## [2.23.0] — 2026-04-11

### Added
- **Commit discipline gates** (T355-T360) — 5 new PreToolUse modules:
  - `commit-counter-gate` — Blocks after 5 file modifications without commit. Cross-checks git diff.
  - `deploy-gate` — Blocks deploy commands when git tree is dirty.
  - `commit-quality-gate` — Blocks short/generic commit messages.
  - `spec-before-code-gate` — Blocks first edit without TODO task or recent descriptive commit.
  - `deploy-history-reminder` — Non-blocking advisory showing recent commits before deploy.
- Anti-circumvention Bash patterns in counter and spec gates (T360).

## [2.22.0] — 2026-04-11

### Added
- **Lessons path fix** (T349) — Injected prompt now specifies full path `~/.claude/hooks/self-analysis-lessons.jsonl` so Claude writes to the correct location.
- **Lessons rotation** (T351) — When lessons file exceeds 200 lines, oldest entries are archived and recent 100 kept. Prevents unbounded growth.
- **More lessons injected** (T352) — MAX_LESSONS increased from 10 to 20 for richer session context.
- **`--lessons` CLI** (T353) — New command shows all self-analysis lessons with `--project`, `--date`, `--archive` filters.
- **Operational lessons** (T350) — `extractOperationalLessons()` captures workarounds, env quirks, and tool gotchas from normal work. Tagged `[OPERATIONAL]` in lessons file.
- **Cross-project stop** (T354) — Stop message now includes instructions for preserving tab and context-resetting to another project when cross-project TODOs are created.

## [2.21.2] — 2026-04-10

### Performance
- **spec-gate caching** (T420) — Added mtime-based caching for specs/ directory scan, TODO.md reads, and autoActivateShtd. Cold call ~108ms, warm calls ~1.7ms avg (was ~98ms). 57x speedup on cached calls. Cache invalidates when file mtimes change.

## [2.21.1] — 2026-04-10

### Fixed
- **T339 test** (T415) — Updated test for T413 self-edit protection removal. Was expecting BLOCK, now expects PASS.
- **Report analysis false coverage gaps** (T416) — `resolveScriptPath` returned `run-hidden.js` wrapper path instead of actual runner on Windows. `isRunner` never matched → 0 modules → all 5 events reported as empty.
- **Report analysis false positives** (T417) — Bare runner name resolved to project dir instead of hooks dir, mixing archived modules into analysis. `_prefix` helper files flagged for missing headers. Score C(8 demerits) → A(0).

## [2.21.0] — 2026-04-10

### Changed
- **hook-editing-gate** (T413) — Removed self-edit protection. hook-runner is the gatekeeper and can now edit all hooks including its own gate. Other projects remain blocked. Weakening detector + quality checks still apply. Hardcoded paths replaced with generic guidance. 16 tests (was 14).

## [2.20.2] — 2026-04-10

### Fixed
- **Workflow gate resilience** (T411) — `checkGate` now handles missing YAML files gracefully instead of throwing ENOENT (was causing 87 errors from stale `.workflow-state.json` paths). Test added.

## [2.20.1] — 2026-04-10

### Fixed
- **Workflow YAML/tag mismatches** (T407) — added `rdp-testbox-gate` and `hook-system-reminder` to `shtd.yml`, removed stale `cwd-drift-detector` from `cross-project-reset.yml`.
- **cpt-gate false positive** (T408) — gate matched "cross-project" as substring, blocking edits referencing workflow names like `cross-project-reset`. Fixed with regex negative lookahead. 8 tests added.

## [2.20.0] — 2026-04-10

### Added
- **hook-system-reminder** (T397) — PreToolUse module reminds Claude that enforcement is ONLY via hook-runner modules, not `.claude/rules/`. Spec + 11 tests.
- **rdp-testbox-gate spec/tests** (T398) — 15-test suite for existing ddei-email-security module.

### Fixed
- **Cross-project write protection** (T400) — `cwd-drift-detector` was tagged `cross-project-reset` workflow (disabled). Moved to `shtd` (always active) so cross-project writes are blocked.
- **Hardcoded paths** (T399) — replaced `ProjectsCL1` references in `hook-system-reminder.js` and `worktree-gate.js` with dynamic env vars.
- **test-modules.sh hang** (T404) — added `process.exit(0)` on sync path to prevent spawned child processes from keeping node alive.
- **Portable paths test** — excluded self-edit-protected `hook-editing-gate.js` from scan.

### Changed
- Added `run-modules/` to `.gitignore` (T401) — local hook copies are not repo content.
- Added `cwd-drift-detector` to `shtd.yml` workflow module list.
- Updated README with `hook-system-reminder` and `rdp-testbox-gate` module entries.

## [2.19.0] — 2026-04-10

### Fixed
- **Auto-continue not firing** (T390-ac) — root cause: run-stop.js ran ALL modules sequentially (T376 change), but config-sync takes 16s and the 5s hook timeout killed the process before auto-continue's block result could return. Fix: blocking modules (auto-continue, never-give-up) run synchronously first (14ms), block output is emitted immediately, then remaining modules spawn as a detached background process (`run-stop-bg.js`). All runners now read `HOOK_INPUT_FILE` env var to avoid Windows stdin pipe deadlock.
- **run-hidden.js stdin pipe deadlock** — replaced synchronous `readFileSync(0)` stdin with async read + 500ms timeout safety. Writes stdin data to temp file (`HOOK_INPUT_FILE`) so child runners avoid the Windows pipe deadlock entirely.

### Added
- **Watchdog health log analysis** (T390-wh) — `checkHealthLog()` in `watchdog.js` reads `hook-health.jsonl`, detects exit code mismatches, repeated crashes, stop-never-blocking anomalies, and timeout kills. Watchdog scheduled task installed (every 10min).
- **windowless-spawn-gate** (T393) — PreToolUse module blocks `execSync`/`spawnSync` calls without `windowsHide: true` in hook module source code.
- **run-stop-bg.js** — detached background runner for non-blocking Stop modules (config-sync, drift-review, self-reflection, etc.). Spawned by run-stop.js after emitting any block result.
- **windowsHide on remaining spawn calls** (T390-whi) — added `windowsHide: true` to 3 remaining spawn calls in chat-export, interrupt-detector.
- **Resolved paths in settings.json** (T393) — setup.js now writes fully-resolved `os.homedir()` paths on Windows instead of `$HOME`, eliminating the need for cmd.exe shell expansion.

## [2.18.1] — 2026-04-09

### Added
- **Lesson effectiveness monitor** (T382) — `lesson-effectiveness` SessionStart module scans `self-analysis-lessons.jsonl` for repeated patterns (3+ similar lessons). Writes escalations to `lesson-escalations.jsonl` and warns at session start. 11 tests.
- **cwd-drift-detector tightened** (T391f) — blocks `git switch -c`, `git checkout -b`, `git branch` when targeting another project. Narrowed context-reset allowlist. 2 new tests (12 total).

## [2.18.0] — 2026-04-09

### Fixed
- **run-hidden.js spawnSync** (T391a) — replaced async `spawn` with `spawnSync` to eliminate orphan processes. Async spawn left grandchildren (git, curl) alive after hook exit, causing Claude Code to run visible `taskkill /T /F` popups. spawnSync ensures the entire child tree is dead before returning.
- **run-hidden.js missing from installer** (T391b) — added `run-hidden.js` to `RUNNER_FILES` in `constants.js` and `files` in `package.json`. Previously, `--install` and `--upgrade` never copied it.
- **hook-editing-gate block message** (T391d) — now includes the actual `context_reset.py` launch command instead of a vague "start a session" instruction.

### Added
- **Runtime hook health monitor** (T390) — `run-hidden.js` logs every invocation to `hook-health.jsonl` (runner name, exit code, stdout/stderr sizes, duration, signal). New `hook-health-monitor` PostToolUse module checks recent entries for crashes, exit code mismatches, timeouts, and repeated failures. 14 tests.
- **Output logging** (T391a) — hook stdout/stderr logged to `~/.system-monitor/hook-output.log` for debugging (CMD windows flash too fast to read).

## [2.17.0] — 2026-04-08

### Added
- **Self-reflection system description** (T379) — `load-lessons.js` now injects a description of how the self-reflection feedback loop works at SessionStart, so Claude participates instead of reinventing it.
- **Bug report conflation criterion** (T380) — self-reflection analysis criterion #10 flags when Claude bundles multiple bugs, skips root cause investigation, or declares "fixed" without testing.
- **Corrective feedback capture** (T381) — when self-reflection detects high-severity user corrections, extracts lessons and writes to `corrective-feedback.jsonl` + `self-analysis-lessons.jsonl` for immediate cross-session learning.

### Fixed
- **PostToolUse runner runs all modules** (T378) — same pattern as T376 Stop fix. All PostToolUse modules now execute even when one blocks early.

## [2.16.0] — 2026-04-08

### Fixed
- **Stop runner runs all modules** (T376) — `auto-continue` blocked first and `process.exit(0)` prevented all subsequent Stop modules (self-reflection, drift-review, mark-turn-complete, etc.) from ever executing. Now collects the first block result, continues running remaining modules, then outputs the block at the end. Minor version bump because this changes Stop event behavior.

## [2.15.3] — 2026-04-07

### Fixed
- **Spec-gate false-positive fuzzy matching** (T374) — when branch has a task ID (TXXX), exact task ID lookup now takes priority over fuzzy word matching. Previously, branch `242-T373-module-review-tab` would match `specs/code-review-cleanup/` via "review" and block with "all tasks done" even though T373 was a valid open task in a different spec. 2 new tests.

## [2.15.2] — 2026-04-07

### Fixed
- **shtd.yml sync** (T369) — added `session-collision-detector` to shtd.yml modules list (audit showed 71 actual vs 70 in YAML). Fixed T094 test to skip underscore-prefixed helper files.
- **pid validation** (T370) — defense-in-depth: `_is-pid-running.js` now validates pid is a positive integer before interpolating into `tasklist` command. Prevents injection if called with unsanitized input.

## [2.15.1] — 2026-04-07

### Fixed
- **Spec-gate subtask detection** (T363) — when a branch references T331, the gate now also checks for unchecked subtasks (T331a-T331z) in `specs/*/tasks.md`. Previously, marking the parent task `[x]` would block all further pushes on that branch even with open subtasks. 2 new tests.
- **DRY** (T362) — replaced deprecated `url.parse()` with `new URL()` in self-reflection.js, extracted brain host/port to module-level constants.

## [2.15.0] — 2026-04-07

### Added
- **Brain bridge** (T331) — self-reflection.js now tries unified-brain `/ask` endpoint first for LLM analysis (fast, has three-tier memory). Falls back to direct LLM subprocess when brain is unavailable. Analysis source (`brain` vs `claude-p`) logged in reflection output and session summaries.
- `isBrainAvailable()` — health check with 2s timeout, cached per invocation.
- `callBrain()` — POST `/ask` with structured reflection payload (question, source, channel, metadata).
- `analyze()` — orchestrator: brain-first with automatic fallback.
- `BRAIN_URL` env var for configuring brain endpoint (default `http://localhost:8790`).
- **Test suite** — `test-T331-brain-bridge.sh` (8 tests: mock brain, fallback, payload validation).

## [2.14.6] — 2026-04-07

### Changed
- **DRY** (T361) — extracted shared `isPidRunning` into `_is-pid-running.js` helper. Underscore prefix convention: `_helper.js` files are utilities skipped by `load-modules.js` and `test-modules.sh`.

## [2.14.5] — 2026-04-07

### Added
- **Session collision detector** (T351) — SessionStart module warns when multiple Claude Code sessions are active on the same project. Writes lock file per project+PID, detects active sessions, warns with PIDs and branches. Prevents context-reset tab proliferation chaos.
- **Session cleanup** updated to sweep stale session-lock files from crashed sessions.
- **Test suite** — `test-T351-session-collision.sh` (8 tests).

## [2.14.4] — 2026-04-07

### Fixed
- **README.md** — updated workflow table (10 → 5 workflows with accurate module counts after T313 consolidation), added `--integrity` and `--report --analyze` to CLI reference, removed stale SessionStart modules.

## [2.14.3] — 2026-04-07

### Added
- **HOOK_RUNNER_TEST guard** — 6 Stop modules (chat-export, config-sync, drift-review, push-unpushed, self-reflection, session-brain-analysis) skip expensive operations when `HOOK_RUNNER_TEST=1` is set, preventing network/git/claude-p calls during test validation.
- **Per-module test timeout** — individual module load/call tests in `test-modules.sh` now have a 10s safety timeout.

### Fixed
- **drift-review.js** — added missing `// WORKFLOW: shtd` tag, fixed return type from bare string to `{text: status}` object.
- **self-reflection.js** — detached HEAD now returns `"HEAD"` instead of empty string.
- **Test suite timeout** — increased per-suite timeout from 120s to 360s for Windows CI stability.

## [2.14.2] — 2026-04-07

### Fixed
- **workflow-summary.js** — defensive try/catch around `findWorkflows()`/`readState()` prevents crash when run outside a project context (fixes module validation test failure).
- **T114 test cleanup** — hardened YAML cleanup with `git show HEAD` fallback to prevent temp module name corruption in `no-local-docker.yml`.

### Changed
- **git branch detection** — `spec-gate.js`, `branch-pr-gate.js`, `enforcement-gate.js` now read `.git/HEAD` directly instead of spawning `git rev-parse` (faster on Windows, avoids timeout under CI load).
- **run-modules sync** — added 32 missing modules to `run-modules/` that existed in catalog but were never tracked.
- Removed unused `child_process` require from `spec-gate.js`, `branch-pr-gate.js`.

## [2.14.1] — 2026-04-07

### Fixed
- **Health check** — utility modules (like `reflection-score.js`) that export objects instead of functions no longer reported as failures. Health check now accepts both function and object exports.
- **`--test-module`** — utility modules skip invocation tests and display exported keys instead of crashing.
- **`reflection-score.js`** — now exports as a function with utility methods as properties, satisfying both the module contract and its role as a shared library.
- **ES5 consistency** — fixed remaining `.startsWith()`/`.endsWith()` calls in run-modules for ES5 compatibility.
- **`shtd.yml`** — added 2 missing modules (`session-cleanup`, `share-is-generic`) to workflow definition. Audit now 69/69.

## [2.14.0] — 2026-04-07

### Changed
- **spec-gate TODO.md fallback tightened** (T340) — on main branch in mature projects (with `specs/`), spec-gate now requires a feature branch instead of allowing blanket edits via any unchecked TODO task. Simple projects still use TODO.md directly.

### Added
- **Test suite** — `test-T340-todo-fallback.sh` (3 tests).

### Fixed
- **README** — added missing `no-rules-gate` module to documentation.

## [2.13.1] — 2026-04-07

### Fixed
- **Session isolation for hook state files** (T337) — temp flag files (`.claude-instruction-pending`, `.claude-turn-complete`, `.claude-bash-failures.json`, `.claude-self-analyze-cooldown`) now include `process.ppid` in filename. Different Claude Code tabs no longer interfere with each other's state.
- **Session cleanup module** — `session-cleanup.js` (SessionStart) sweeps orphaned flag files from crashed sessions by checking if the PID in the filename is still running.
- **Test suite** — `test-T337-session-isolation.sh` (8 tests: PID-scoped writes, cross-tab isolation, old-format ignored).

## [2.13.0] — 2026-04-07

### Added
- **spec-gate Bash gating** (T338) — default-deny for Bash commands. Only allowlisted read-only commands (git, ls, cat, grep, etc.) pass without spec chain. Everything else requires spec → tasks → unchecked items.
- **Hook editing project lock** (T339) — only hook-runner project sessions can edit hook infrastructure. Other projects get hard block.
- **Bootstrap self-edit protection** (T339) — editing `hook-editing-gate.js` itself always blocked. Must be edited manually.
- **Static weakening detection** (T339) — flags modules claiming to enforce but never blocking, bare `return null` replacements.
- **Hook audit trail** (T339) — all edit attempts logged to `~/.system-monitor/hook-audit.jsonl`.
- **Test suites** — `test-T338-spec-gate-bash.sh`, `test-T339-hook-lock.sh`, expanded `test-T118` (10→14 tests).

## [2.12.0] — 2026-04-07

### Added
- **UserPromptSubmit module ban** (T341) — `hook-editing-gate` now blocks ALL UserPromptSubmit module creation. Any bug in a UPS module locks the user out with no recovery path. All detection/logging must live in PreToolUse/PostToolUse/Stop.
- **Frustration detection in UPS runner** (T346) — runner itself logs prompt previews to hook-log and detects frustration patterns (repeated phrases, escalation signals) → writes `frustration-log.jsonl`. No modules needed — runs in the runner process.
- **Constraint-rejection analysis** (T343) — self-reflection prompt now asks "did Claude declare a requirement impossible?" to catch premature surrender.
- **Wrong-tool-for-intent analysis** (T343) — self-reflection prompt checks if tool usage matched user's stated intent (e.g. grep local files when user said "research").
- **Frustration scoring** (T344) — `FRUSTRATION_DETECTED` (-15) and `RAPID_INTERRUPT_CLUSTER` (-20) penalties in reflection-score from frustration-log.jsonl events.

### Fixed
- **Self-reflection hasEdits guard removed** (T342) — sessions with user frustration but no file edits were completely skipped. The worst sessions (all talk, no action) now get reflected on.
- **No-edit session handling** (T347) — `buildPrompt()` shows "NO FILES EDITED" warning so `claude -p` analysis flags unproductive sessions.

### Removed
- **frustration-detector.js** (T345) — archived. UPS module approach was fundamentally flawed (blocking user prompts). Frustration detection moved to runner level.

## [2.11.0] — 2026-04-06

### Added
- **Session summary compaction** (`reflection-sessions.jsonl`) — one-line JSON summary after each reflection (files edited, issues found, score delta). Last 3 summaries injected into `claude -p` prompt for cross-session awareness. Interim short-term memory until brain integration (T331).
- **Reflection-gate scope enforcement** (T330) — replaced broad `/hooks/` allow with specific hook-runner module paths. Self-reflection can self-repair its own modules (`run-modules/`, `hook-runner/modules/`, runners, workflow files) but delegates everything else via TODOs.
- **Self-Reflection Architecture section** in CLAUDE.md — documents interim (direct `claude -p`) vs target (brain plugin) architecture.

### Fixed
- **DRY self-reflection** — `callClaude()` returns `{raw, parsed}`, removing duplicate `parseResponse()` call.
- **Cost optimization** — skip `claude -p` when no Edit/Write in recent hook-log entries (read-only/Bash-only stops).
- **Nested-claude gate FP** — `no-nested-claude.js` now skips `git`/`gh_auto` commands (path strings containing "claude" triggered false positives).

## [2.10.0] — 2026-04-06

### Added
- **Gamified reflection scoring** (`reflection-score.js`) — points for clean reflections (+10), autonomous stretches (+3/10 tool calls), TODO follow-through (+5). Penalties for user corrections (-5), dismissed improvements (-3), workflow violations (-10). Levels: Novice → Apprentice → Journeyman → Expert → Master.
- **Intervention tracking** — analyzes hook-log for user correction patterns ("no", "stop", "wrong"), interrupts, and autonomous stretches. The ultimate autonomy metric: how much user time are you saving vs wasting?
- **Full claude -p audit logging** (`reflection-claude-log.jsonl`) — every Stop runs LLM analysis. All prompts, raw responses, parsed results, and timing logged for audit and tuning.
- **Score injection at SessionStart** (`reflection-score-inject.js`) — every new session sees its score, level, streak, and the WHY behind the system.
- **Self-reflection prompt improvements** — now checks for dismissed improvements ("good enough for now") and missed TODOs. Auto-writes discovered TODOs to TODO.md.
- **Motivation loop** — the WHY is baked into the score file: "This score measures how well you protect the user's time."

### Fixed
- **Reflection-gate loophole** — removed `self-reflection.jsonl` from allow list. Claude can no longer edit the reflection log to unblock itself.
- **Self-reflection always runs** — removed rate limiting from claude -p calls. Every Stop is a checkpoint.

## [2.9.0] — 2026-04-06

### Added
- **Self-reflection system** — LLM-powered introspection for hook-runner itself. `self-reflection.js` (Stop, async) calls `claude -p` to review recent gate decisions, checking if edits were appropriate for the current branch/task context. `reflection-gate.js` (PreToolUse) blocks production code edits if unresolved high/medium severity issues exist. Together they form a feedback loop: hooks watch Claude → self-reflection watches hooks → reflection-gate enforces corrections.
- **Spec-gate task ID enforcement (T321)** — if branch name contains TXXX pattern, verifies that specific task is unchecked in TODO.md or specs/*/tasks.md. Previously only checked that *any* task existed, allowing edits for unrelated tasks.
- **Cross-project guidance (T322)** — all spec-gate block messages now include instructions for cross-project workflow (write TODOs in other project → context_reset.py → resume).
- **"Spec before code" reminder (T323)** — all spec-gate block messages explicitly say "Write the spec FIRST, then create tasks, then code."
- **cross-project-todo-gate** — new PreToolUse module, blocks writing cross-project TODO items into local TODO.md.
- **no-adhoc-commands** — synced from live with Azure/terraform/azcopy/RDP blocks.

### Fixed
- **cross-project-todo-gate** — replaced hardcoded project prefixes (`_grobomo/`, `_tmemu/`) with dynamic directory discovery under PROJECTS_ROOT.

## [2.8.2] — 2026-04-06

### Added
- **`--analyze --deep`** — runs LLM analysis via `claude -p` (5 min timeout) for deeper semantic insights (coverage gaps, DRY overlap, consolidation recommendations). Saves prompt to `~/.claude/reports/analysis-prompt.txt` for manual re-run.
- **`--analyze --input <file>`** — loads pre-computed LLM analysis JSON and merges with local heuristics. LLM takes priority for qualitative categories; performance entries are merged.

### Fixed
- **Operator precedence bug in healthCheck** — `!subFiles[si].slice(-3) === ".js"` always evaluated to `false`. Fixed to `subFiles[si].slice(-3) !== ".js"`. Project-scoped modules in subdirs were silently skipped during health validation.
- **ES5 consistency** — replaced remaining `.endsWith()`/`.startsWith()` in setup.js (14), workflow.js (7), workflow-cli.js (8) with `.slice()`/`.indexOf()`/`.charAt()`

## [2.8.1] — 2026-04-05

### Fixed
- **load-modules.js** — replaced 2 remaining `.endsWith()` ES6 calls with `indexOf()` for ES5 consistency

## [2.8.0] — 2026-04-05

### Added
- **`--analyze` flag** for `--report` — generates a System Analysis section with quality score, coverage gaps, DRY issues, performance observations, redundancy detection, and recommendations. Uses heuristic rules (no external LLM dependency).
- **force-push-gate** (PreToolUse) — blocks `git push --force` to main/master. Force-pushing destroys shared history with no undo.
- **crlf-detector** (PostToolUse) — warns when Write/Edit produces CRLF line endings in shell scripts, YAML, Python, and other Unix-sensitive files.
- **git-destructive-guard** (PreToolUse) — blocks `git reset --hard`, `git checkout .`, `git clean -f` without diagnosis.
- **config-sync** (Stop) — auto-commits and pushes ~/.claude changes to cloud backup at session end.

### Performance
- **Merged hook-integrity-check into hook-integrity-monitor** — eliminated ~378ms from SessionStart. The UserPromptSubmit monitor now does a full scan on first invocation (or every hour), then spot-checks between.
- **Debounced config-sync** — skips if last successful sync was <1 hour ago. Cuts SessionStart from ~4093ms to ~400ms on subsequent sessions within the same hour.

### Fixed
- **4 test suites fixed** — T094 (module docs), T097 (workflow modules), T101 (workflow CLI), T104 (workflow summary) all referenced `code-quality` workflow consolidated into `shtd` in T313. Tests now use correct workflow names.
- **T094/T097 `find` hangs on Windows** — replaced `find` with `node` for module enumeration. Git Bash `find` is extremely slow on Windows.
- **Analysis spike detection** — raised threshold from 30x to 50x ratio and added 500ms floor to reduce noise from normal git cold-call spikes.
- **Analysis redundancy threshold** — raised from 1000 to 2000 calls with "(may be preventive)" qualifier for gates that succeed because users learned the rules.
- **Duplicate WHY detection** — now shows event/module path (e.g. `SessionStart/config-sync and Stop/config-sync`) instead of ambiguous bare names.
- **README module table** — added `crlf-detector`, `force-push-gate`, `git-destructive-guard`, `config-sync` (Stop).

### Removed
- **gsd-gate** — archived from live hooks. Fully superseded by test-checkpoint-gate.
- **hook-integrity-check** (SessionStart) — merged into hook-integrity-monitor (UserPromptSubmit).
- **test-tmp-mod-200506** — test artifact archived from catalog.

## [2.7.1] — 2026-04-05

### Performance
- **config-sync moved from SessionStart to Stop** — cuts SessionStart overhead from ~4093ms to ~776ms (81% reduction). Config sync runs at session end instead of start, where the 3-7s git push latency isn't blocking the user.

### Fixed
- **CHANGELOG duplicate** — report expand/collapse fix was listed in both 2.7.0 and 2.6.4; removed duplicate from 2.6.4.
- **backup-check** — removed "async example" language; this is a production module, not a demo.

## [2.7.0] — 2026-04-05

### Changed
- **Workflow consolidation** — merged 6 active workflows (code-quality, infra-safety, messaging-safety, self-improvement, session-management) into **shtd**. Down from 11 workflows to 5 (2 active: shtd + customer-data-guard, 3 dormant). shtd now has 58 modules covering the entire dev workflow: spec→PR pipeline, code quality, infrastructure safety, messaging guards, session lifecycle, and self-improvement.

### Fixed
- **Report expand/collapse** — `toggleModule` used `nextElementSibling` which pointed to `.module-why` instead of `.module-detail` when WHY text was present. Now uses `parentElement.querySelector(".module-detail")`.

### Added
- **`--analyze` command** — generates report with LLM-powered analysis (quality score, coverage gaps, DRY issues, performance observations, recommendations). Uses `claude -p` when run from terminal; gracefully skips when unavailable.
- **scripts/archive-live-workflows.sh** — reusable script to archive stale workflow YAMLs from live hooks dir

## [2.6.4] — 2026-04-05

### Fixed
- **hook-integrity-monitor rate limiter** — in-memory `_lastCheckTime` was always 0 (each hook invocation is a fresh Node process). Replaced with file-based timestamp in `~/.claude/hooks/.integrity-last-check`. Saves ~85ms per prompt when rate-limited.

## [2.6.3] — 2026-04-05

### Improved
- **PreToolUse runner** — shared `input._git.tracking` alongside branch context; `remote-tracking-gate` no longer spawns its own `git config` call (~33ms savings per Edit/Write on feature branches)

## [2.6.2] — 2026-04-05

### Fixed
- **spec-gate performance** — use shared `input._git.branch` from runner instead of spawning redundant `git rev-parse` (~45ms savings per Edit/Write) (#184)
- **T105 test** — read VERSION from package.json at runtime instead of broken sed pattern (#183)
- **T204 test** — remove path pattern in code comment that triggered portable-paths detection (#183)

### Added
- **Marketplace sync** — v2.6.1 → claude-code-skills

## [2.6.1] — 2026-04-05

### Fixed
- **Project dir decoding** — `--integrity` CLI now correctly resolves hyphenated names (`hook-runner`), dot-prefix dirs (`.claude`), and nested paths using greedy filesystem-aware decode (#180)

### Added
- **Decode tests** — `--integrity --json` validation and `decodeProjectDir` path resolution tests (#181)

## [2.6.0] — 2026-04-05

### Added
- **Hook integrity monitor** — 3 new modules that enforce hook system integrity across all Claude sessions (#176)
  - `workflow-compliance-gate` (PreToolUse): blocks if globally enforced workflow disabled at project level. Caught ddei session running ad-hoc without SHTD.
  - `hook-integrity-check` (SessionStart): verifies live modules match repo checksums, auto-repairs drift, reports workflow compliance status
  - `hook-integrity-monitor` (UserPromptSubmit, async): spot-checks random sample of modules each prompt, rate-limited 60s, full repair on drift
- **Repo marker file** — `sync-live` writes `.hook-runner-repo` to hooks dir so integrity modules can find source of truth
- **Exception whitelist** — manual `workflow-exceptions.json` for projects that legitimately need different workflow config
- **Test suite** — 18 tests for integrity monitor components (#176)

### Fixed
- Spec-gate test: added missing `spec.md` + initial git commit to temp repo (#173)
- README module docs: added 3 ep-incident-response modules to table (#173)

## [2.5.10] — 2026-04-05

### Added
- **customer-data-guard workflow** — read-only incident response with 3 project-scoped modules (no-customer-env-changes, no-data-exfil, v1-read-only) (#170)

### Fixed
- **Workflow audit** now scans project-scoped subdirectories, not just top-level modules (#170)
- **Catalog sync** — spec-gate (branch-aware matching, auto-SHTD activation) and test-checkpoint-gate (tighter allowlist) synced from live (#170)

## [2.5.9] — 2026-04-05

### Added
- **Report: Workflow summary** — clickable cards showing each workflow and its modules, with block counts (#168)
- **Report: Workflow filter** — toolbar buttons to filter all modules by workflow name (#168)
- **Report: Workflow badge** — colored badge on each module card showing its workflow (#168)
- **Report: WHY text** — incident description shown prominently below module name, no longer buried in source (#168)

## [2.5.8] — 2026-04-05

### Fixed
- Replace `.startsWith()` and `.endsWith()` ES6 methods with `indexOf()` in 9 module files for ES5 consistency (#166)

## [2.5.7] — 2026-04-05

### Performance
- `preserve-iterated-content` module: use `git rev-list --count` instead of `git log --oneline` (faster, no output parsing), reduce timeout from 3s to 1.5s

### Fixed
- `preserve-iterated-content`: replace `.some()` ES6 method with for-loop for ES5 consistency
- `rule-hygiene`: replace `.includes()` ES6 method with `indexOf()` for ES5 consistency

## [2.5.6] — 2026-04-05

### Added
- `terminal-title` SessionStart module — sets terminal title to project folder name for multi-tab disambiguation (#162)
- `session-management` workflow now has 12 modules (was 11)

## [2.5.5] — 2026-04-05

### Fixed
- Replaced remaining `.forEach()` with for-loops for ES5 consistency (#157)

### Security
- Sanitize env var inputs in `config-sync` module to prevent command injection (#159)

## [2.5.4] — 2026-04-05

### Improved
- Watchdog `required_runners` now checks all deployed files including `constants.js` (#154)
- `healthCheck()` and `project-health` module now use shared `RUNNER_FILES` constant (72→76 checks) (#155)

## [2.5.3] — 2026-04-05

### Fixed
- `sync-live` now copies `workflow.js` and `workflow-cli.js` to live hooks (#150)
- `--uninstall` now removes `report.js` (was orphaned after uninstall) (#152)
- Added `constants.js` to `package.json` files array (fixed broken `npx` install) (#152)

### Improved
- DRY: extracted `RUNNER_FILES` to `constants.js` shared by `setup.js` and `workflow-cli.js` (#151)

## [2.5.2] — 2026-04-05

### Improved
- Added WORKFLOW/WHY header checks to module validation tests (#147, #148)
- Module tests now traverse project-scoped subdirectories (test count: ~100 → 244)

## [2.5.1] — 2026-04-05

### Fixed
- `--uninstall` now removes `workflow.js` and `workflow-cli.js` (were installed but not cleaned up) (#144)

### Improved
- DRY: shared `RUNNER_FILES` constant eliminates 3 divergent file lists in install/upgrade/uninstall (#145)

## [2.5.0] — 2026-04-05

### Improved
- Shared git context in PreToolUse runner — one `git rev-parse` call shared across 4 modules instead of each spawning independently (~80ms savings per tool call) (#140)
- `--workflow sync-live` now copies core files (runners, loader, logger) and project-scoped module subdirectories (#142)
  - File count: 66 → 78. Runner changes are now deployed automatically.

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
