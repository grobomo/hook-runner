# hook-runner — Project Tracking

## Overview
Modular hook runner system for Claude Code. One runner per event, modules in folders.
- Repo: grobomo/hook-runner (public)
- Marketplace: trend-ai-taskforce/ai-skill-marketplace → plugins/hook-runner
- Local skill: ~/.claude/skills/hook-runner/
- Live hooks: ~/.claude/hooks/ (run-*.js, load-modules.js, run-modules/)

## Current State (v3.1.0)
- 191 modules in catalog, 8 workflows (2 archived), 269 test suites, ~3900 tests
- 32 stop rules (was 30)
- Watchdog always-on (T828): validates stop hook decisions, installed in settings.json
- Rule files moved from proxy/ to hooks/rules/ (T806) with backward-compatible fallback
- L1 preprocessor upgraded (T743): gathers TODO/coconut/correction context before Haiku call
- Plugin system: external projects can register gates in ~/.claude/hooks/plugins/ (T752)
- Safety modules: 52 active under haiku-rules (was 26 — T790 fix)
- PRs: 542 merged (PR #541 squash-merged)
- CI: 1 flaky test failure (T636 haiku-judge — env-dependent, pre-existing)
- Block message compliance: 114/121 blocking gates have FALSE POSITIVE escape hatch
- Stop rules: modularized — 30 individual YAML files in `rules/stop/` (T758 + T826 + T798)
  - `metacognate-next` renamed to `keep-working`, never returns DONE (T801)
  - `expert-decides-implementation` added (T826): catches technical implementation questions
  - `band-aid-detection` added (T798): catches one-off workarounds for recurring problems
  - `destructive-action-review` added (T798): catches destructive commands without dry-run
- Enforcement audit: 10/22 stop rules gate-backed, 12/22 judgment-only (T773)
- PostToolUse runner NEVER blocks (T803) — stderr warnings only
- New shared helper: `_shtd-enforce.js` for prerequisite enforcement (T794)
- Stop decision conflicts now visible (T804) — CORRECT>CONTINUE>NEXT>DONE priority
- Trace debugging always-on (T805) — no more toggle
- Workflow extends + dedup (T796): shtd/gsd now 59 own modules + 47 inherited from starter
- no-rewrite-gate: `.rewrite-approved` sidecar override now implemented (was documented but missing)
- spec-gate: shtd TODO.md bypass closed (T829) — TODO.md alone no longer satisfies spec chain under shtd
- Session 2026-06-02f: T829, T830, T796, T800, T813, no-rewrite-gate fix, cleanup (7 items)
  - T829: spec-gate shtd TODO.md bypass closed (8 tests)
  - T830: Stop rule expert-decides-implementation (23rd stop rule)
  - T796 step 4: shtd/gsd deduplicated — 47 modules removed from each (inherited via extends)
- Session 2026-06-02g: T831 (health report)
  - T831: SessionStart health-report-check — 10-point mechanical health check at session start. 21 tests.
  - T800: Gate placement rules — confirmed enforced via T803 (PostToolUse never blocks)
  - T813: behavioral-claude-md-check.js — detects behavioral rules in CLAUDE.md (17 tests)
  - Email-manager session spawned to build email read/send system
- Session 2026-06-02h: T830, T802, T817, T807, T744 (safety + request tracking)
  - T832: marked done (was built last session but not marked)
  - T830: close-old-tab-gate — blocks --close-old-tab with cross-project --project-dir (20 tests)
  - T802: todo-first-gate — blocks work until user requests tracked in TODO.md (28 tests)
  - T817: gate-spec-required-check — warns on behavioral TODOs without gate spec (16 tests)
  - T807: self-healing findings → .self-healing-findings.json → health-report surfacing (16 tests)
  - T744: abandoned-request-check — flags untracked requests at Stop (17 tests)
  - T745: session-level tracking resolved via T802+T744
  - T821: superseded by T817+T820
  - T670: superseded by T802
  - 2 new stop rules: band-aid-detection (#24), destructive-action-review (#25)
  - deploy-test-gate caught untested deploy of self-healing-gate (gate working as intended)
- Session 2026-06-03a: T798, T812, no-rewrite-gate FP escape
  - T798: All 7 stop rules completed — #26 system-health-awareness, #27 gate-block-followthrough, #28 priority-enforcement, #29 spec-before-code-review, #30 gate-effectiveness-audit
  - T812: Full gate audit — extended audit-gates.js with architecture compliance checks (rule type, event placement, inversions, log activity, workflow validation). Report at docs/gate-audit/audit-results.md
  - no-rewrite-gate: standardized block messages (BLOCKED/WHY/NEXT STEPS/FALSE POSITIVE)
  - T834: Tests for 4 untested haiku-rules modules: gate-quality-gate (25), violation-gate (13), no-native-memory-gate (16), reflection-first-gate (15). 69 new tests total.
  - audit-gates.js bug fix: workflow config uses bool not {enabled:bool}, workflow-disabled not counted as issues
  - Test suite: 672 module smoke tests (no regressions), stop rules test updated (CORRECT verb, dynamic count)

- [x] T832: **Gate: block deploy-to-live without tests** — DONE. PreToolUse mechanical gate `deploy-test-gate.js`. Blocks `cp` to `~/.claude/hooks/run-modules/` when no corresponding test file exists in `scripts/test/`. 15 tests. Deployed to live.
  - no-rewrite-gate: .rewrite-approved sidecar override implemented (21 tests)
  - Cleanup: wsl + cross-project-reset workflows archived, duplicate T826/T827 renumbered
  - T808: reflection-first-gate forces TODO.md reflection after user corrections

## TOP PRIORITY — Watchdog (user-directed 2026-06-02)

- [x] T826: **Watchdog decision validator** — DONE (merged into T828). Added `checkStopDecision()` to watchdog: checks user prompt availability, DONE-vs-TODO contradiction, decision conflicts, stop hook crash. Fires on every Stop event as 2nd hook entry. Vision: `docs/watchdog/vision.md`. Spec: `docs/watchdog/spec.md`.
- [x] T827: **Watchdog modification gate** — DONE. Added `watchdog` as protected type in `isProtectedPath()` for `hook-runner-watchdog.js`. Enhanced audit logging for watchdog edits. Weakening detector runs on watchdog changes. All existing tests pass (37+8+17). Deployed to live.
- [x] T828: **Enable watchdog NOW** — DONE. Removed `isEnabled()` toggle from `runAsHook()`. Watchdog is always-on — if in settings.json, it fires. Added `checkStopDecision()` (T826). Installed in settings.json as 2nd Stop hook. Updated on/off CLI to informational. 38/38 tests. Deployed to live.

## Debugging & Observability (user-directed 2026-05-21)

- [x] T726: **"No system-reminder after stop = failure" detection**
  - Turn tracking: UPS runner writes `.last-turn-start` `{session, turn, ts}`, Stop stamps turn in `.last-stop-fired`
  - PreToolUse `stop-fired-check-gate.js` compares turn markers — blocks ONCE if stop missed
  - Dedup via `.stop-gap-alerted`. 13 tests. Installed live.

- [x] T727: **Central debugging toolkit (trace-session.js)**
  - Added: `--analyze` flag calls Haiku for behavioral pattern analysis
  - Added: fix-break cycle detection (same gate blocks twice within 2min)
  - Added: frustration signal correlation (reads frustration-log.jsonl)
  - Writes `session-trace-latest.md` to hooks dir for context-reset pickup

- [x] T728: **Remove "rules checked" from TUI output** — rules_checked removed from stderr, logged to hook-log.jsonl only.

- [x] T729: **Fix haiku gate alignment** — Haiku prompt now labels user's message as "HIGHEST PRIORITY — user's words always override TODO items."

- [x] T730: **Self-check mechanism** — `scripts/self-check.js`
  - 5 checks: stops-fired, stop-health, fix-break, user-satisfaction, mandate-compliance
  - Haiku alignment scoring (score 0-100, concern text)
  - JSON mode (`--json`), strict mode (`--strict` exits 1 on failure)
  - Writes `self-check-latest.json` for automation. Recommendations on failure.

- [x] T731: **Log haiku decisions to debug log (not TUI)** — rules_checked field in hook-log.jsonl log entry. TUI shows only decision+reason+actions.

## URGENT — Stop Hook Not Firing (diagnosed from llm-token-tracker session 2026-05-25)

- [x] T740: **Stop hook returns null because Claude Code doesn't send assistant_response** — Fixed: (1) run-stop.js now writes `.last-stop-input.json` with keys/lengths on every stop, (2) auto-continue-gate.js has `findTranscriptPath()` that searches `~/.claude/projects/*/SESSION_ID.jsonl` and `readLastFromTranscript()` as fallback. If still can't read, returns a diagnostic block instead of null. 8 tests.

- [x] T741: **Build hook debugging mode** — Created `hook-debug.js` utility. When `HOOK_DEBUG=1` or `~/.claude/hooks/.debug-mode` exists: runners write input JSON to `debug/`, modules log start/end/error to `trace.jsonl`, run-stop.js writes stderr on exit(0). CLI: `node setup.js --debug on|off|status|trace`. File-based activation (survives resets). Prune support. 11 tests.

- [x] T742: **Add proxy restart protocol to stop-haiku-rules.yaml** — Already implemented. Rule `proxy-restart-protocol` at line 137 of stop-haiku-rules.yaml fires on proxy restart mentions, directs to `scripts/proxy-restart-safe.sh`.

## Stop Hook Reliability (filed from cegp session 2026-05-22)

- [x] T738: **Stop: stop-health-report module** — Implemented as safety net in run-stop.js (not a separate module). After all haiku modules run, if `blocks.length === 0`, generates synthetic block with diagnostic info (loaded module names, investigation steps). Also added stderr output for re-entrant `stop_hook_active` exits. 8 tests.

- [x] T739: **Fix conscience-gate transcript reader** — Resolved by T740. conscience-gate was merged into auto-continue-gate. The new `readLastFromTranscript()` uses correct `entry.type === "user"` and `entry.message.content[].text` path.

## CRITICAL LESSONS (2026-05-20 session — DO NOT FORGET)

1. GATES ARE MEMORY. MD FILES ARE NOTES. Claude Code "memory" system is useless — disable it.
2. Never say "it works" — run verify script, show output, or shut up.
3. Never fix things once — build a gate or it repeats next session.
4. Never force push — destroyed entire gate system.
5. Never speculate about TUI — you can't see it.
6. stderr is what shows in TUI, not stdout JSON.
7. Haiku proxy down = gates return null = invisible = BROKEN. Error paths must return blocks.
8. Dedup removed — haiku runs fresh every stop.
9. Two gates were redundant — merged to one (stop-analysis-gate disabled).
10. Cross-project mandates bleed when CLAUDE_SESSION_ID unset — scope by project.
11. Promises don't survive context resets — only gates do.
12. The PVA cycle: PREDICT → TEST → COMPARE → ANALYZE → FIX → ITERATE → ALIGN WITH USER VISION.

## IMMEDIATE TODO (do these in order, verify each before moving on)

- [x] T716: **Disable Claude Code memory system** — MEMORY.md set to "disabled". Gates and TODO.md are the only persistence mechanisms.
- [x] T717: **Fix ALL null returns in auto-continue-gate.js** — 0 null returns in module.exports. All error paths return blocks with actionable repair commands.
- [x] T718: **Verify stop hook fires with test input** — Verified: exit 1, stderr output with SELF-CHECK message. haiku-client.js fixed (ANTHROPIC_AUTH_TOKEN fallback added).
- [x] T719: **Build verification system** — Safety net built INTO run-stop.js: if all gates return null, forces stderr output with repair commands. Always exit 1. Never silent. Two layers: (1) gates try to always block, (2) runner catches if all fail.
- [x] T720: **Build "promises-to-gates" gate** — Active at PreToolUse/promises-to-gates-gate.js. Detects promise language, blocks with "CONVERT TO A GATE".

- [x] T723: **Add Haiku decision transparency** — Haiku prompt now asks for `rules_checked` field. Output includes "Rules checked: ..." in TUI stderr so user sees which rules were evaluated.
- [x] T721: **Fix L1 Haiku gate failure** — haiku-client.js restored from llm-token-tracker, ANTHROPIC_AUTH_TOKEN fallback added.
- [x] T722: **Restart proxy** — Proxy healthy at :4100 (verified via curl). Issue was auth token not being passed, not proxy being down.

## PRIORITY — Infrastructure Hardening (user-directed 2026-05-20)

All other work is paused until these are done. Order matters.

- [x] T700: **Enable "no work unless TODO item" check in wsl workflow**
  - todo-gate.js already active in wsl workflow, verified firing in hook-log

- [x] T701: **Fix all haiku gate error paths — infra-first, never silent**
  - auto-continue-gate.js: 0 null returns in module.exports. 5 error paths → CONTINUE with repair commands.
  - stop-analysis-gate.js: 0 null returns in module.exports. Dedup removed. 2 error paths → CONTINUE.
  - Every error message: specific file path, specific command, expected outcome.
  - Dedup completely removed from both gates — Haiku runs fresh every stop.
  - VERIFIED LIVE: stop hook visible in TUI on every stop (confirmed 18:15).

- [x] T702: **Mechanical infra health checks — _infra-health-check.js**
  - Runs FIRST (alphabetically before haiku gates via `_` prefix)
  - Checks: gate files exist + valid syntax, rules YAML exists + has content, proxy :4100 healthy, haiku-client.js exists
  - Pure mechanical — no LLM, no trust
  - Blocks with numbered repair instructions if any check fails

- [x] T703: **Reorganize project — move root files into subfolders**
  - `src/` — load-modules.js, hook-log.js, run-async.js, workflow.js, workflow-cli.js, constants.js
  - `runners/` — run-stop.js, run-pretooluse.js, run-posttooluse.js, run-sessionstart.js, run-userpromptsubmit.js, run-hidden.js, run-stop-bg.js
  - `cli/` — setup.js, report.js, demo.js, snapshot.js, diagnose.js, preflight.js, generate-manifest.js, watchdog.js
  - package.json bin updated to `cli/setup.js`, REPO_DIR fixed to parent
  - NOTE: Root copies still exist (old + new coexist). Remove root copies after confirming no external references depend on them.

- [x] T704: **Verify everything works after reorganization**
  - `node cli/setup.js --test` — 213 suites, 2851 passed, 17 failed (pre-existing + 2 new: T091-package, T094-module-docs check root file presence)
  - Live hooks unaffected (independent copies at ~/.claude/hooks/)
  - Haiku gate visible in TUI confirmed (SELF-CHECK messages appearing)

- [x] T705: **Gitignore non-shared files**
  - `.coconut/` already in .gitignore
  - `run-modules/` already in .gitignore (live hooks, not repo)
  - No other local-only files found

- [x] T707: **Merge redundant stop gates into one**
  - stop-analysis-gate.js disabled (returns null immediately) — auto-continue-gate handles everything
  - Saves ~3s Haiku per stop event
  - Added no-speculation-about-system rule to stop-haiku-rules.yaml

- [x] T708: **PVA enforcement framework (Predict-Verify-Align)**
  - Haiku rule `pva-cycle-enforcement` in stop-haiku-rules.yaml
  - Haiku rule `never-stop-and-wait` prevents deferring work  
  - Safety net in run-stop.js + verify-stop-hook.sh
  - maxTokens 300→500 fixed truncation that disabled Haiku

- [x] T709: **Update archive-not-delete gate block message** — Now includes instructions to add exception via TODO if gate is wrong. Mandate file exception already added earlier.

- [x] T710: **Vision alignment check before gate changes** — Haiku rule `gate-change-alignment` checks all gate mods against vision.yaml at stop time.

- [x] T711: **Auditable and reversible gate changes** — hook-autocommit-gate.js (PostToolUse) auto-commits to ~/.claude git repo on every hook/proxy/CLAUDE.md edit.

- [x] T714: **Fix L1 Haiku gate failure** — Restored haiku-client.js + auth fallback. Verified working in WSL.

- [x] T715: **NEVER force-push** — git-destructive-guard now in wsl workflow.

- [x] T724: **Fix spirit-check false positives** — Rewrote gate-weakening-spirit in spirit-rules.yaml. Clear list of what IS and ISN'T a violation. Allowlist additions no longer flagged.

- [x] T725: **Session behavioral analysis skill** — SKILL.md at ~/.claude/skills/session-analysis/. Script at scripts/analyze-session.js. Haiku rule `did-you-test-it` added to enforce testing after changes.

- [x] T712: **Define user global vision and workflow visions** — ~/.claude/proxy/vision.yaml created.

- [x] T706: **Rewrite README** — Removed "Integrating with other Claude Code tools". Added "How the System Decides" with full stop-hook flow, gate examples, decision hierarchy.

## COMPLETED REDESIGN (2026-05-20)



### T667: Architecture redesign — execution order, visibility, folder structure ✓

**DONE (2026-05-20):**
- Created `modules/Stop/1-haiku/` with auto-continue-gate.js + stop-analysis-gate.js
- Created `modules/Stop/2-mechanical/` (empty, ready for future regex guards)
- Created `modules/Stop/_disabled/` with archived always-blockers
- Fixed stop-analysis-gate.js: now ALWAYS returns block (even on DONE — was returning null)
- Rewrote run-stop.js: ordered execution (haiku → mechanical → background), backwards-compatible
- Fixed no-rewrite-gate bug: sidecar `.rewrite-approved` file was documented but never checked
- 21 new tests (test-T667-stop-ordered-execution.sh), all existing stop tests pass (50 total)
- Live hooks in sync: `~/.claude/hooks/run-modules/Stop/1-haiku/` has both fixed gates

### T666: Disable auto-continue.js and never-give-up.js ✓
Done as part of T667 — moved to `modules/Stop/_disabled/`.

### T664: Update haiku-rules paths in JS loaders
Part of T667 (new folder structure eliminates the symlink hack). No path changes needed — rules still load from `~/.claude/proxy/stop-haiku-rules.yaml`.

### T665: Auto-dispatch on DISPATCH decision
Part of T667 step 3. run-stop.js now parses DISPATCH from haiku reason via `parseHaikuDecision()`. Currently exits 1 like CONTINUE (Opus reads the directive). Full dispatch automation (spawn new session) deferred.

## Bugs (dispatched from llm-token-tracker session 2026-05-19)

- [x] T662: **PreToolUse: portal-verify-gate.js** — Blocks marking cost validation tasks complete in TODO.md without portal evidence. Checks /tmp/.hook-runner-portal-evidence.json (TTL 30min). 24 tests (shared with T663).

- [x] T663: **PostToolUse: portal-evidence-recorder-gate.js** — Records Blueprint MCP browser_navigate calls to portal.rdsec.trendmicro.com. Writes evidence JSON consumed by T662. TTL-pruned. 24 tests.

## Bugs (dispatched from lab-worker session 2026-05-16)

- [x] T661: **PreToolUse: worktree-scope-guard-gate.js** — Blocks EnterWorktree when name doesn't match project name, TODO word, or task ID. Prevents session drift. 13 tests.

## Bugs (dispatched from publishable-audit 2026-05-11)

- [x] T640: **cwd-drift gate blocks new_session.py cross-project dispatch** — Fixed: moved session management script allowlist (`new_session.py`, `context_reset.py`) to early return before path extraction. Both script path and `--project-dir` argument no longer trigger false positives. 14 tests (2 new).

## Focus-Steal Fix (dispatched from system-monitor T040, 2026-05-11)

- [x] T657: **Add `windowsHide: true` to haiku-client.js execSync** — Fixed: added windowsHide to the curl execSync options. Was the only hook subprocess call missing it.

## Event-Driven Observability (from claude-portable specs/event-driven-observability/)

- [x] T655: **PostToolUse async module: tool-event-guard.js** — Emits `tool.used` events to JSONL at `$CLAUDE_EVENT_LOG`. No-op when env var unset. Truncates command at 200 chars. Includes task_id/stage/worker_id from env. Async (returns null). 10MB log rotation. 10 tests.
- [x] T656: **Stop module: status-emitter-guard.js** — Emits `claude.stopped` event to JSONL at `$CLAUDE_EVENT_LOG`. No-op when env var unset. Includes task_id, stage, stop reason, worker_id. 10MB log rotation. 9 tests.

## Stop Analysis Gate — Mandate Dedup + Corrections (from llm-token-tracker, 2026-05-15)

- [x] T660: **Mandate deduplication for stop-analysis-gate.js** — Added `mandate-log.jsonl` tracking to both auto-continue-gate.js and stop-analysis-gate.js. After CONTINUE/NEXT/DISPATCH, logs `{rule, decision, gate, session, ts}`. Before calling Haiku, checks for same-session mandates within 10min — skips if found. Cross-gate dedup (either gate's mandate prevents both from firing). Max 20 entries, pruned on write. 13 tests.

- [x] T661: **Corrections feed for stop-analysis-gate.js** — Added `getRecentCorrections()` to both auto-continue-gate.js and stop-analysis-gate.js. Reads `stop-corrections.jsonl` for session-scoped corrections (last 1hr, max 5). Injected as "CORRECTIONS FROM SESSION" block in Haiku prompt between rules and context. Format: `{"correction": "...", "ts": "...", "session": "..."}`. 8 tests (21 total in T660 suite).

## URGENT — Stop Hook Crash (filed from dd-lab session 2026-05-29)

- [x] T747: **run-stop.js crashes — missing hook-debug.js** — Fixed: copied `hook-debug.js` from repo to `~/.claude/hooks/`. Verified: run-stop.js no longer crashes on require, syntax OK. Stop hooks operational again.

## Stop Hook — False DONE on Missing User Prompt (filed from request-tracker 2026-05-29)

- [x] T749: **Stop hook said DONE when it should have said CONTINUE** — In request-tracker, Opus asked "Want me to start building the MVP?" and the stop hook returned DONE because "User's last prompt is unavailable." Two fixes:
  1. Added `never-stop-uncertain` rule to stop-haiku-rules.yaml — triggers when user prompt is unavailable OR Claude is asking permission. Returns CONTINUE.
  2. Tightened `metacognate-next` — only returns DONE when user prompt IS available AND work is visibly complete.
  Root cause: Haiku defaulted to DONE on uncertainty. Correct default is CONTINUE — stopping loses the session, continuing at worst does extra work.

## Hook Runner Watchdog (user-directed 2026-05-29)

- [x] T750: **Separate watchdog hook that validates hook-runner fired correctly** — `hook-runner-watchdog.js`: completely separate hook with own settings.json entry. Checks: (1) hook-log.jsonl has recent entry, (2) no errors/crashes, (3) runner scripts exist with valid requires, (4) load-modules.js exists. Features: `deploy` (backup → install → verify → auto-rollback on failure), `backup`/`restore`, `monitor [sec]` (watch loop, auto-rollback after 3 consecutive failures), `on`/`off` toggle via flag file. Separate `watchdog-log.jsonl`. 33 tests.

## Sibling Session Detection (user-directed 2026-05-29)

- [x] T751: **Sibling session detect gate (MVP)** — `sibling-session-detect-gate.js`: non-blocking PreToolUse module. Checks fleet API at `:4100` every 10th tool call for other active sessions in the same project. 5-min cooldown between alerts. Warns via stderr with sibling task info. Returns null always (never blocks). 17 tests. Future: coordination logic may move to fleet-manager project.

- [x] T753: **Fix user prompt unavailability in Stop hooks** — Root cause: `findTranscriptPath()` relied on `CLAUDE_SESSION_ID` env var which was often unset. Added fallback: find most-recently-modified `.jsonl` in `~/.claude/projects/` matching CWD (within 5 min). Live + repo synced.

- [x] T755b: **Session-scope turn tracking for multi-tab safety** — `.last-turn-start`, `.last-stop-fired`, `.stop-gap-alerted` were global — 3 tabs in same project would clobber each other's turn markers causing false stop-gap alerts. Fixed: all 3 files now include session prefix (e.g., `.last-turn-start-abcd1234`). Updated 6 files (3 live + 3 repo): run-userpromptsubmit.js, run-stop.js, stop-fired-check-gate.js. Test updated. Verified: gate correctly blocks missed stops with scoped files.

- [x] T755: **User prompt still unavailable in Stop hooks** — Root cause found: two bugs in `readLastFromTranscript()`. (1) Search window was 30 lines but user text is 60+ lines back due to interleaved `tool_result` entries. Fixed: expanded to 120 lines. (2) User entries with `type: "user"` can contain only `tool_result` items (no text) — function returned empty string on first match instead of continuing search. Fixed: skip user entries with no text parts. Live + repo synced.

- [x] T756: **Haiku gate self-history (5-call lookback)** — auto-continue-gate now reads its last 5 decisions from hook-log.jsonl before calling Haiku. Injected as "RECENT STOP DECISIONS" block in the prompt with age, decision, triggered rule, and reason. Loop detection: if 3+ CONTINUE for same rule, Haiku suggests a different approach or DONE. Live + repo synced.

- [x] T757: **L1→L2→L3 escalation pipeline** — COMPLETED:
  ```
  L1 (Haiku, ~1s, $0.001): Gate decisions. Reads last 5 own calls.
    Anomaly triggers → auto-escalate to L2:
    - Same rule fired 3+ times consecutively
    - Flip-flop (DONE→CONTINUE→DONE) within 5min
    - User prompt unavailable + no transcript fallback
    - Module crash/error in hook-log

  L2 (Sonnet, ~3s, $0.01): Deep analysis. Reads transcript, TODO, hook-log.
    - Diagnoses root cause of L1 anomaly
    - Generates repair plan (if auto-fixable)
    - Writes findings to ~/.claude/hooks/self-healing/
    - If not auto-fixable → escalates to L3 via stop hook output

  L3 (Opus, the session): Receives structured alert in stop hook.
    - Alert includes: what L1 detected, what L2 diagnosed, suggested fix
    - Opus can act on it or delegate to another session
  ```
  Implementation complete: `detectAnomalies()` detects 4 anomaly types (stuck-loop, flip-flop, module-crashes, prompt-unavailable). `escalateToL2()` calls Sonnet via haiku-client.js. `writeL2ToSelfHealing()` persists findings to `self-healing/lessons/gate/l2-escalations.jsonl`. L2 analysis appended to stop hook output for L3 (Opus). 30 tests. Deployed to live.

- [x] T754: **Self-healing module with modular lesson files** — `self-healing-gate.js` (Stop, BLOCKING, haiku-rules). Scans last 100 hook-log entries for errors, slow modules (>2s), user prompt unavailability. L1 classifies each issue (fixable? severity? fix_type?). Writes to hierarchical store:
  - `~/.claude/hooks/self-healing/lessons/{category}/{subcategory}.jsonl` — per-category lesson files
  - `~/.claude/hooks/self-healing/index.json` — weighted index for fast recall (sorted by frequency)
  - 5 top-level categories: transcript, module, config, runtime, gate (each with subcategories)
  - CLI: `node self-healing-gate.js status|recall <path>` for querying lessons
  - Recall API: `recallLessons("module", 10)` returns most-frequent module issues
  Installed live + repo. Next: T757 (L1→L2→L3 escalation pipeline) for auto-repair.

- [x] T752: **Modular plugin system for external project integration** — Built plugin scanning in `load-modules.js`. External projects place modules in `~/.claude/hooks/plugins/<project-name>/<Event>/*.js`. Scanned after global+project-scoped modules, before workflow/tool/dep filtering. Plugin modules follow same contract as regular modules (WORKFLOW/TOOLS/WHY tags, sync/async). Multiple plugins supported, `_` prefix modules skipped. 10 tests + 628 existing pass. Deployed to live. Future: `plugin.json` manifest for metadata/dependencies if needed.

## Stop Hook — Abandoned Request Detection

- [x] T744: **Stop hook should detect unanswered/abandoned user requests** — DONE. Built `Stop/2-mechanical/abandoned-request-check.js`. Reads `.pending-requests-{session}.json` (written by T802 UPS runner). At Stop, checks if requests are tracked in TODO.md. Flags untracked ones as abandoned. Auto-clears when all tracked. 30-min expiry. 17 tests. Deployed.

## Session Request Tracker

- [x] T745: **Stateful request tracking** — Session-level tracking resolved by T802 (todo-first-gate) + T744 (abandoned-request-check). UPS runner extracts requests → `.pending-requests-{session}.json`. PreToolUse blocks until tracked. Stop flags abandoned ones. Cross-channel tracking (email+Teams) is request-tracker project scope, not hook-runner.

- [x] T746: Session-level tracking resolved by T745 (T802+T744). Cross-channel (email+Teams) is request-tracker project scope.

## L1 Preprocessor Redesign

- [x] T743: **L1 Haiku preprocessor upgraded from copyeditor to research assistant** — DONE. L1 now gathers context mechanically before calling Haiku: (a) TODO.md unchecked items summary, (b) Coconut status requests, (c) Recent corrections from correction-log.jsonl, (d) Reflection-pending flag. Context bundled into Haiku prompt AND written to l1-analysis.md with "Pre-gathered Context" section. Haiku now returns `action` field (what Opus should do first). Updated userprompt-haiku-rules.yaml with `context_awareness` section. Deployed to live.

## Open Tasks
- [x] T612: Create GETTING-STARTED.md — 5-minute onboarding guide. Linked from README. (PR #518)
- [x] T611: Fix onboarding UX — setup.js workflow name dynamic, README module counts updated, --diagnose added to docs. (PR #517)
- [x] T610: Add tests for 5 untested PreToolUse modules — force-push-gate (14), commit-quality-gate (21), no-hardcoded-paths (19), no-polling-gate (30), no-rules-gate (14). 98 new tests. (PR #515)
- [x] T610b: Tests for all remaining untested modules. Batch 2 (PR #520, 6 modules/101 tests), batch 3 (PR #521, 5 modules/65 tests), batch 4 (PR #522, 2 modules/33 tests), batch 5 (PR #523, 7 modules/136 tests). All modules now have test coverage.
- [x] T609: Fix worktree-gate test env leak + spec-gate control structure allow. 16/16 worktree + 79 spec-gate tests. (PR #514)
- [x] T608: Fix _bash-write-patterns.js false positive — echo/printf/cat redirect patterns matched across statement boundaries and on stderr redirects. Fixed with `[^;|&]*` + `(?<![0-9])` lookbehind. 63 tests (12 new). (PR #512)
- [x] T613: Updated nested-claude gate — now distinguishes info commands (--help, --version) from subprocess commands (claude -p). Info commands get "you ARE Claude" message. Subprocess commands get 3 alternatives: separate terminal, context_reset.py, PowerShell Start-Process. Also fixed gate-quality-gate name convention check to only apply to new files. 28 tests.
- [x] T578: Marketplace sync — Published to `trend-aatf-external/hook-runner` (private, EMU org). Org name is `trend-aatf-external` (accessible via tmemu account). Remote `aatf` added to local repo. EMU org doesn't allow public repos — grobomo/hook-runner remains the public source.
- [x] T607: Add T605/T606 modules to README table + version bump to v2.73.0. Also added to live modules.yaml.
- [x] T596: Project health — archived 468 completed tasks + 5 stale handoffs to TODO-COMPLETED.md (1468→35 lines).
- [x] T597: Remove broken UserPromptSubmit hook from lab-worker settings.json — already fixed (was `{"hooks": {}}`)
- [x] T598: Improve hook-editing-gate.js block message with actionable 3-step instructions. Both Bash bypass and Edit/Write blocks updated. Test added (17 tests).
- [x] T604: Hook diagnostics — `node setup.js --diagnose [project-dir]`. Settings resolution, hook validation, --fix, --json. 10+21 tests. (PR #509)
- [x] T603: User correction detector — PostToolUse module, prompt-log.jsonl real-time, strong/moderate patterns, dedup, correction-log.jsonl. 61 tests. (PR #508)
- [x] T605: automate-everything-gate — blocks manual lint/check commands, forces CI/CD pipeline. 27 tests.
- [x] T606: no-lessons-file-gate — blocks writes to lessons.jsonl, forces hook module creation. 11 tests.
- [x] T613: tunnel-check-gate — blocks process-grep SSH tunnel checks, suggests port connectivity. 29 tests. (PR #519)
- [x] T614: Fix README module counts + v2.77.0 changelog + GitHub releases. (PRs #524-#525)
- [x] T615: Add `--list --why` flag — shows WHY descriptions inline. 11 tests. (PR #527)
- [x] T616: Fix windowless-spawn-gate test env leak — HOOK_RUNNER_TEST cleared during test. 32/32 pass. (PR #528)
- [x] T617: Version bump v2.78.0 + changelog + GitHub release. (PR #529)
- [x] T618: Fix `--test-module` to resolve bare module names — searches all event folders. 11 tests. (PR #531)
- [x] T619: Fix GETTING-STARTED.md (starter 49→46) + README `--test-module` examples. (PRs #532-#533)
- [x] T620: Fix diagnose.js tilde expansion in Windows 8.3 paths — `RUNNER~1` was expanded to HOME. CI now fully green. 22 tests. (PR #535)
- [x] T621: Add `--search <query>` — find modules by name or WHY description. 15 tests. (PR #537)
- [x] T623: Spawn-reason tracking — stop module should pass `--reason` to context_reset.py. Depends on context-reset T034 (`--reason` arg). Done in PR #539 — stop-message.txt now includes `--reason` in both context_reset.py and new_session.py calls.
- [x] T624: Rewrite spec-gate with auto-activation — activate when: publish.json=public, specs/ already exists, shared org, feat/ branch. Dormant otherwise. Removed WORKFLOW tag, added shouldActivate() with caching. 10 new tests. (PR #540)
- [x] T635: UPS settings guard — hook-editing-gate blocks UserPromptSubmit in any settings.json. 4 tests. (PR #541)
- [x] T636: Create _haiku-judge.js shared helper — POST /judge to llm-token-proxy (port 4100). 8 tests. (PR #542)
- [x] T637: Wire victory-declaration gate through _haiku-judge.js — regex pre-filters, then haiku-judge does semantic check. Fallback to regex-only when judge unavailable. Updated 3 test files for async handling (39 tests total).
- [x] T638: Standardize haiku rules file naming — done in previous session (PR #544). Files now at ~/.claude/proxy/{stop,sessionstart,userprompt}-haiku-rules.{yaml,md}. Copied to Windows in this session.
- [x] T625: Chat-export skill verified end-to-end — export.py parses JSONL (244 turns), generates 554KB self-contained HTML, creates landing page with search.
- [x] T626: Test all active gates in live session — todo-gate, settings-watchdog-gate, gate-quality-gate, cross-project-todo-gate
- [x] T627: Fix 5 broken gates — regex patcher had injected `_log(...)` inline into `return null` statements, breaking JS syntax. Fixed by stripping corrupted patterns. 3 gates restored (no-rewrite, settings-watchdog, todo-gate), 2 were already working (cross-project-todo, proxy-restart).
- [x] T628: Add logging to wsl workflow gates — spec-gate was the only active gate missing logging. Added _log() wrapper with block-tag extraction. 10/11 active wsl PreToolUse gates now have logging. Remaining non-wsl gates deferred (only run when those workflows are enabled).
- [x] T629: gate-quality-gate Bash detection — added Bash interception for writes to hooks/run-modules/ and hook-runner/modules/. Detects cp, mv, redirect, heredoc, sed -i, tee, python write_text. 20 tests.
- [x] T630: agent-quality-gate live test — verified in session 18. Agent matcher active, gate fires on Agent tool calls, Haiku analysis via proxy at :4100 works (2061ms). Full pipeline confirmed: matcher → runner → gate → haiku-client → proxy → Haiku.
- [ ] (deferred) Port remaining OpenClaw modules (configurable/niche: aws-tagging, deploy-gate, messaging-safety, etc.)

### Worktree-awareness bugs (reported from dd-lab session 39, 2026-05-08)
- [x] T631: spec-before-code-gate worktree awareness — added findGitRoot(CWD) + isWorktree() check. Worktree TODO.md and git log now checked alongside CLAUDE_PROJECT_DIR. 3 new tests (23 total).
- [x] T632: spec-gate worktree root detection — changed roots.unshift(cwdRoot) so worktree is checked first for specs/, TODO.md. Also accepts worktrees when projectDir is empty. 3 new tests (11 total).
- [x] T633: Branch detection fixed — consequence of T632 fix. roots.unshift() puts worktree first, so branch detection finds feature branch before "main". Tested.
- [x] T634: Victory-declaration gate false positives — tightened VICTORY_WORDS regex. Bare "completed" no longer triggers (was hitting historical references). Now requires "completed successfully" or "all X completed". 5 new tests (36 total across 2 suites).
- [x] T640: Spirit-check system installed — spirit-check.js (PostToolUse, Haiku audits tool calls against spirit-rules.yaml), violation-gate.js (PreToolUse, blocks on high-severity violations). Both installed live and in repo catalog. Gate-quality-gate updated to whitelist .pending→.js renames. 16 tests.
- [x] T641: Fix stop hook — was three issues: (1) BLOCKING_MODULES hardcoded list didn't include new -gate modules → replaced with // BLOCKING: true tag (T639), (2) run-stop.js only kept first block → now collects ALL blocking results, writes stop-analysis.md, outputs to stderr, (3) settings.json timeout was 5s, haiku needs ~6s → set to 30s from haiku-config.json. (PR #540)
- [x] T642: Fix settings-watchdog-gate.js corruption — fixed during WSL module copy to Windows. Stripped `.trim()});` + bare `return null;` artifacts from no-rewrite-gate and todo-gate too.
- [x] T643: mcp-manager enforcement gate — blocks direct MCP server entries in .mcp.json and direct npx/node/python MCP relay invocations. Redirects to servers.yaml + mcp-manager commands. 22 tests.
- [x] T644: hook-editing-gate block message directive — changed "TO MODIFY HOOKS:" to "DO THIS NOW (do not ask the user):" with absolute path. Removed session-launch suggestion (too complex). Just write TODO + continue.
- [x] T639: Standardize module meta parsing — single-pass parseModuleMeta() replaces 3 separate parsers. getHeaderLines() scans full comment block (was slice(0,8) — missed 3 modules). Added BLOCKING tag, central haiku-config.json, settings.json backup-on-change. (PR #540)
- [x] T635: Wire auto-continue-gate stop module to spawn api_check.py --watch as detached process when API error patterns detected in transcript. Enables autonomous recovery: session dies → watcher waits → spawns fresh session. 15 tests.
- [x] T645: Haiku directive enforcement (Panama Canal model) — auto-continue-gate writes structured continue-directive.json with scoped `allow` list when haiku says CONTINUE. PreToolUse continue-directive-gate reads allow list to permit only tools targeting allowed files (TODO.md, SESSION_STATE.md, etc.). Read/Glob/Grep always pass. Circuit breaker at 3 same-rule strikes. 10min expiry. Stale session detection. Prevents deadlock where enforcement blocks the tools needed to comply.
- [x] T646: T626 live gate verification — all 16 active wsl gates verified. Found and fixed: T648 (Agent matcher missing from settings.json), T649 (T627 corruption in todo-gate and no-rewrite-gate — both had early return null preventing blocking). spirit-check false positives noted (flags gate FIXES as "weakening").
- [x] T647: MOOT — continue-directive-gate.js from T645 was never created. Closed (duplicate entry cleaned up).
- [x] T653: diagnose.js WSL cross-platform detection — Windows-native hooks (`C:/...`) now labeled XPLAT instead of BROKEN. Exit code 0 when only cross-platform hooks exist. 11 tests (1 new).
- [x] T654: Fix haiku-client.js markdown fence stripping + maxTokens increase — Haiku wraps JSON in fences, wasting tokens. Pre-tool-verify-gate 200→400, L1 triage 150→300. Eliminates truncation-caused parse failures.

## Session Handoff (2026-05-20, session 20)
- **T667**: Stop architecture redesign COMPLETE
  - `modules/Stop/1-haiku/` — auto-continue-gate.js, stop-analysis-gate.js (both always return block)
  - `modules/Stop/2-mechanical/` — dashboard-deploy-verify-gate.js, screenshot-public-site-gate.js (llm-token-tracker scoped)
  - `modules/Stop/_disabled/` — archived always-blockers
  - run-stop.js: ordered execution (haiku first → mechanical only on DONE → background)
  - 21 new tests (test-T667-stop-ordered-execution.sh)
- **T666**: Superseded by T667 (auto-continue.js, never-give-up.js → _disabled/)
- **T671**: dashboard-deploy-verify-gate.js — blocks stop if dashboard edited without S3+CF+screenshot. 20 tests.
- **T672**: screenshot-public-site-gate.js — blocks stop if frontend edited without public site screenshot. 20 tests.
- **T673**: dashboard-deploy-reminder-gate.js — non-blocking reminder on dashboard Edit/Write. 15 tests.
- **T625**: proxy-routing-check-gate.js (SessionStart) — verifies ANTHROPIC_BASE_URL → :4100, auto-starts proxy. 12 tests.
- **Bugfix**: no-rewrite-gate `.rewrite-approved` sidecar was documented but never checked — fixed in live hooks.
- **Bugfix**: Cleared stale mandate-unknown.json (cross-session bleed from T041).
- v2.86.0. 142 modules, 215 suites, ~2885 tests.
- **T662**: portal-verify-gate.js (PreToolUse) — blocks cost validation without portal evidence. 24 tests.
- **T663**: portal-evidence-recorder-gate.js (PostToolUse) — records Blueprint portal navigations. 24 tests.
- **Remaining**: T661 (worktree guard), T674 (blueprint guidance), T670 (deferred—UPS rule conflict).

## Session Handoff (2026-05-11, session 18)
- **T630**: agent-quality-gate live test confirmed — Agent matcher active, gate fires on Agent tool calls, Haiku analysis via proxy at :4100 works (2061ms). Full pipeline verified.
- **T640**: cwd-drift-detector fixed — `new_session.py` and `context_reset.py` now allowed in early return before path extraction. Both script path and `--project-dir` argument no longer trigger false positives. 14 tests (2 new).
- **T653**: diagnose.js WSL cross-platform detection — Windows-native hooks no longer count as BROKEN. 0 broken hooks (was 8 false positives). 11 tests (1 new).
- **T654**: haiku-client.js markdown fence stripping + maxTokens increase. Pre-tool-verify-gate 200→400, L1 triage 150→300.
- **T655**: tool-event-guard.js (PostToolUse async) — emits tool.used events to $CLAUDE_EVENT_LOG. No-op without env var. 10 tests.
- **T656**: status-emitter-guard.js (Stop) — emits claude.stopped events to $CLAUDE_EVENT_LOG. No-op without env var. 9 tests.
- v2.85.0. 204 suites, ~2710 tests. Snapshot refreshed.
- **Remaining**: T578 (marketplace, blocked on user). OpenClaw ports (deferred).

## Session Handoff (2026-05-11, session 17)
- **T626/T646**: Live gate verification complete. All 16 active wsl workflow gates verified:
  - PreToolUse (10): gate-quality-gate (596/14), mandate-gate (153/5), mcp-manager-gate (413/90), no-rewrite-gate (1686/0→now functional), pre-tool-verify-gate (1408), proxy-restart-gate (1628), settings-watchdog-gate (2003/6), todo-gate (1990/0→now functional), violation-gate (454/8), agent-quality-gate (FIXED: was never firing)
  - PostToolUse (2): post-tool-use-gate (356), spirit-check (96)
  - Stop (2): auto-continue-gate (63/37), stop-analysis-gate (47/10)
  - SessionStart (2): load-instructions-gate (12), stop-hook-selftest (6)
- **T648**: Added Agent matcher to settings.json PreToolUse hooks. Updated settings-watchdog-gate safe-change allowlist to permit hook matcher additions.
- **T649**: Fixed T627 corruption in todo-gate (2 sites) and no-rewrite-gate (3 sites). Pattern: `.trim()});` appended to comment + orphaned `return null;` causing early exit. Both gates were completely non-functional (always passing).
- **T650**: Updated spirit-rules.yaml — gate-weakening-spirit now recognizes corruption removal as bug fixing.
- **T651**: agent-quality-gate migrated from `claude -p` to haiku-client.js (~4s via proxy vs 15s CLI spawn).
- **T652**: Fixed pre-tool-verify-gate rate limiter — in-memory var didn't persist across Node processes, now file-persisted.
- v2.84.0 pushed. 202 suites, 2685 tests.
- **Next session**: T630 (agent-quality-gate live test — needs session restart for Agent matcher). T578 (marketplace, blocked on user).

## Session Handoff (2026-05-11, session 16)
- **T619/T620**: run-stop.js bestBlock now uses HAIKU_GATES array for both Haiku gates + >50 char fallback. 23 tests.
- **T621**: mandate-gate.js (PreToolUse) — enforces stop-hook CONTINUE directives by blocking first tool call with mandate text. auto-continue-gate writes/clears mandate.json, passes prior mandate context to Haiku. 24 tests.
- **T614**: L1 Haiku triage in UserPromptSubmit — resolves shorthand via haiku-client + userprompt-haiku-rules.yaml. Session-scoped files, + bypass, 4s timeout. 20 tests.
- **T637**: victory-declaration-gate wired through _haiku-judge.js — regex pre-filters, semantic check via judge, fallback on unavailability. 3 test files updated for async. 39 tests.
- **T628**: spec-gate logging added (only active wsl gate without it).
- **T625**: chat-export skill verified end-to-end (244 turns, 554KB HTML, landing page).
- L1 triage fix: bumped timeout 4s to 8s, added regex fallback for truncated JSON.
- Mandate-gate first live test: Haiku hallucinated T111 from another project. Mandate enforced correctly but content was wrong. Need better project scoping in stop-haiku-rules.
- v2.83.0. 129 catalog modules, 202 suites, ~2685 tests.
- **Next session**: T626/T646 (live gate verification, needs fresh context). T630 (agent-quality-gate). T578 (marketplace, blocked on user).

## Session Handoff (2026-05-11, session 15)
- **T616**: WSL haiku-client.js auth fix — ANTHROPIC_AUTH_TOKEN fallback (live file only)
- **T631-T633**: Worktree awareness for spec-before-code-gate + spec-gate. 6 new tests.
- **T634**: Victory-declaration gate — tightened regex for false positives. 5 new tests.
- **T617**: run-stop.js bestBlock — prefers Haiku output. 1 new test.
- **T643**: New mcp-manager-gate — blocks direct .mcp.json entries and MCP relay scripts. 22 tests.
- **T644**: hook-editing-gate directive messaging — "DO THIS NOW" instead of "TO MODIFY HOOKS"
- **T618**: Expanded Bash detection in hook-editing-gate (sed -i, perl -i, tee, redirects). 8 new tests.
- **T647**: Marked MOOT (continue-directive-gate never created)
- v2.82.0. 128 catalog modules, 200 suites, ~2634 tests. PR #541 squash-merged.
- Remaining open: T578 (marketplace, blocked), T637 (haiku-judge), T625/T626/T646 (testing), T628 (logging), T630 (agent-quality-gate)

## Session Handoff (2026-05-04, session 14)
- T621 (PR #537): `--search <query>` — find modules by name or WHY description. Case-insensitive. 15 tests.
- T622: README + GETTING-STARTED.md updated with `--search` and `--list --why`. v2.80.0.
- v2.80.0. 118 catalog modules, 193 suites, ~2869 tests, 538 PRs.
- Remaining open: T578 (marketplace sync, blocked on user), deferred OpenClaw module ports.

## Session Handoff (2026-05-04, session 13)
- T615 (PR #527): `--list --why` flag shows `// WHY:` descriptions inline in module catalog. 11 tests.
- T616 (PR #528): Fixed windowless-spawn-gate test env leak — gate checks HOOK_RUNNER_TEST, test now saves/clears it. 32/32 pass.
- T618 (PR #531): `--test-module` resolves bare names from any event folder. 11 tests.
- T619 (PRs #532-#533): GETTING-STARTED.md starter 49→46, README `--test-module` examples updated.
- T620 (PR #535): Fixed diagnose.js `/~/g` → `/^~/g` — Windows 8.3 short names like `RUNNER~1` were corrupted. **CI now fully green** for first time (all runs were failing on Windows before this).
- v2.79.0. 118 catalog modules, 192 suites, ~2854 tests, 535 PRs.
- GitHub repo description updated (122→118 modules, 13→7 workflows).
- Remaining open: T578 (marketplace sync, blocked on user), deferred OpenClaw module ports.

## Session Handoff (2026-05-04, session 12)
- T610b batch 5 (PR #523): Tests for all 7 remaining untested modules — 136 new tests. enforcement-gate (15), cross-project-todo-gate (24), inter-project-priority-gate (34), secret-scan-gate (15), workflow-gate (28), workflow-compliance-gate (8), branch-pr-gate (85).
- T610b COMPLETE — every module now has test coverage. 190 suites, 2821 tests total.
- T614 (PRs #524-#525): Fixed README module counts (starter 49→46, shtd 110→104), v2.77.0 changelog.
- GitHub releases created for v2.76.0 and v2.77.0. Snapshot refreshed (391 files).
- v2.77.0. 122 modules, 190 suites, 525 PRs.
- Remaining open: T578 (marketplace sync, blocked on user), deferred OpenClaw module ports.
- Project fully current: all tests pass, live hooks synced, snapshot fresh, releases published.

## Session Handoff (2026-05-04, session 11)
- T613 (PR #519): tunnel-check-gate module — blocks process-grep SSH tunnel checks. 29 tests.
- T610b batches 2-4 (PRs #520-#522): 199 new tests for 13 modules. 7 modules remain untested (branch-pr-gate, workflow-compliance-gate, cross-project-todo-gate, secret-scan-gate, inter-project-priority-gate, enforcement-gate, workflow-gate).
- v2.76.0. 122 modules, 183 suites, ~2685 tests, 522 PRs.
- Next: remaining T610b (7 complex modules), or user-directed work.

## Session Handoff (2026-05-04, session 10 continued)
- T611 (PR #517): Fixed setup.js "shtd"→dynamic workflow name, README module counts, --diagnose docs.
- T612 (PR #518): Created GETTING-STARTED.md — 5-min onboarding guide, linked from README.
- PRs: 518 merged total. Next: T610b (more tests) or user-directed work.

## Session Handoff (2026-05-04, session 10)
- v2.73.0→v2.75.0. Three PRs: T608 (#512), T609 (#514), T610 (#515). Plus version bumps (#513, #516).
- **T608**: Fixed _bash-write-patterns.js false positives — redirect patterns constrained to single statements + exclude stderr fd redirects. 63 tests.
- **T609**: Fixed worktree-gate test intermittency (HOOK_RUNNER_TEST env leak). Added for/while/if to spec-gate BASH_ALLOW_PATTERNS.
- **T610**: Added 98 new tests for 5 untested PreToolUse modules (force-push-gate, commit-quality-gate, no-hardcoded-paths, no-polling-gate, no-rules-gate).
- GitHub releases created for v2.74.0 and v2.75.0.
- Live hooks synced with T608/T609 fixes.
- **Still waiting on user**: T578 marketplace questions (aatf-external org, marketplace differences).
- **Next session**: T610b (21 more untested modules), or any new work from user.

## Session Handoff (2026-05-04, session 9)
- v2.72.0→v2.73.0 (previous session did T605/T606/T607 directly on main).
- This session: T603 (user-correction-detector, PR #508), T604 tests (PR #509), changelog (PR #510), README fix (PR #511).
- CLAUDE.md updated with Publishing Rules section: never publish to shared marketplaces without user permission.
- publish.json needs manual user edit to add `team_sharing_approved: false`.
- Investigated spec-before-code-gate "failures" — env issue (hooks intercept test runner), 20/20 pass with HOOK_RUNNER_TEST=1.
- Cleaned 2 stale worktrees + 6 stale branches.
- **WAITING ON USER**: Marketplace questions — what is aatf-external org, difference vs trend-ai-taskforce, where does hook-runner belong.

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

- [x] T614: L1 Haiku triage in UserPromptSubmit — calls haiku-client with user prompt + userprompt-haiku-rules.yaml system prompt. Resolves shorthand, detects ambiguity, enriches context. Output prints to stdout as `<user-prompt-submit-hook>`. Session-scoped l1-analysis-{session}.md with symlink. 4s timeout, + prefix bypass. 20 tests.

- [x] T615: Fix stop-analysis-gate.js not showing in TUI — added `// BLOCKING: true` tag to both stop-analysis-gate.js and auto-continue-gate.js. Synced live run-stop.js and load-modules.js with repo (isBlocking + blocks[] array). Added both gates + gate-quality-gate to repo catalog. 20 tests. (PR #546)
- [x] T629: gate-quality-gate Bash detection — now intercepts cp, mv, redirect, write_text, heredoc, sed -i, tee targeting hook module dirs. Distinguishes live (.pending required) vs repo catalog (quality checks only). Added to repo catalog. 20 tests. (PR #546)
- [x] T647: MOOT — continue-directive-gate.js from T645 was never created. Closed.

- [x] T616: WSL haiku-client.js missing ANTHROPIC_AUTH_TOKEN fallback — added `ANTHROPIC_AUTH_TOKEN` check before `LLM_PROXY_AUTH` in `getAuth()`. Live file patched. Verified: Haiku call succeeds in 1.2s (was failing with no auth). T616b merged into this.
- [x] T616b: (merged into T616)

- [x] T617: run-stop.js bestBlock preference — prefers stop-analysis-gate (Haiku reasoning) over alphabetically-first static message. Live file synced. 1 new test.
- [x] T618: Expanded Bash detection in hook protection — now catches sed -i, perl -i, tee, redirects, cat redirects, and python write_text targeting protected directories. 8 new tests (32 total).

- [x] T619: URGENT — run-stop.js bestBlock now uses HAIKU_GATES array (both stop-analysis-gate and auto-continue-gate) + >50 char fallback. 23 tests.

- [x] T620: run-stop.js HAIKU_GATES array replaces single stop-analysis-gate check. Both repo and live hooks synced.

- [x] T648: Add Agent matcher to settings.json PreToolUse hooks — settings.json only had Edit/Write/Bash matchers. Agent calls never fired PreToolUse. Added "Agent" matcher entry, updated settings-watchdog-gate safe-change allowlist. Takes effect next session.
- [x] T649: Fix T627 corruption in todo-gate and no-rewrite-gate — regex patcher injected `.trim()});` + orphaned `return null;` into comment lines, causing early returns that disabled all blocking. todo-gate: 2 sites, no-rewrite-gate: 3 sites. Both gates now functional.
- [x] T650: Fix spirit-check false positives on gate repairs — updated gate-weakening-spirit and settings-bypass-spirit rules in spirit-rules.yaml to recognize corruption removal as bug fixing and hook matcher additions as safe.
- [x] T651: Migrate agent-quality-gate from claude -p to haiku-client.js — was spawning full Claude CLI session (15s timeout, expensive). Now uses local proxy at :4100 (~4s, logged). Added proper _log() wrapper, invoke/result logging.
- [x] T652: Fix pre-tool-verify-gate rate limiter — module-level `_lastCallMs` var reset to 0 every invocation (fresh Node process). Replaced with file-persisted timestamp. Call 2 now takes 1ms (was ~2s).
- [x] T621: Mandate enforcement gate — mandate-gate.js (PreToolUse) reads mandate.json written by auto-continue-gate (Stop). Blocks first tool call with mandate text, sets seen=true, passes subsequent calls. 10min expiry. Auto-continue-gate writes mandate on CONTINUE, clears on DONE, passes prior mandate context to Haiku. 24 tests.

- [x] T622: Cross-session bleed — Scoped `mandate.json` → `mandate-{session}.json` and `stop-analysis.md` → `stop-analysis-{session}.md`. Updated 4 files: mandate-gate.js, auto-continue-gate.js, stop-analysis-gate.js, run-stop.js. Each reads `CLAUDE_SESSION_ID` prefix (first 8 chars). Sessions no longer see each other's mandates or analysis. Cleaned stale global files. 11 tests.

- [x] T623: Mandate enforcement — continuous verification. mandate-gate.js now tracks `call_count` and calls Haiku every 5th tool call to verify Opus is on track. If Haiku says not on track, re-blocks with drift message. File-persisted call counter. Fail-open when Haiku unavailable. 11 tests.

- [ ] T624: **Add X-Project header to ai-skill-marketplace** — BLOCKED: project not cloned locally. File: `.claude/settings.json`. Add `"env": {"ANTHROPIC_CUSTOM_HEADERS": "X-Project: ai-skill-marketplace"}`. Filed from llm-token-tracker (2026-05-16).

- [x] T625: **SessionStart: proxy-routing-check-gate.js** — Verifies ANTHROPIC_BASE_URL → :4100, health-checks proxy, attempts auto-start on failure. Non-blocking. WORKFLOW: wsl. 12 tests.


## URGENT: New Gates (dispatched from llm-token-tracker, 2026-05-18)

- [x] T670: **UserPromptSubmit: track-requests-gate.js** — Superseded by T802 (todo-first-gate). UPS runner extracts requests via Haiku, PreToolUse gate enforces TODO.md tracking. No UPS module needed.

- [x] T671: **Stop: dashboard-deploy-verify-gate.js** — BLOCKING. In `2-mechanical/llm-token-tracker/`. Checks transcript for dashboard edits, blocks if missing S3 upload + CloudFront invalidation + screenshot. 20 tests (shared with T672).

- [x] T672: **Stop: screenshot-public-site-gate.js** — BLOCKING. In `2-mechanical/llm-token-tracker/`. Blocks when frontend files edited + public URL present + no screenshot evidence. 20 tests.

- [x] T674: **PreToolUse: blueprint-guidance-gate.js** — Pattern-based guidance for Blueprint MCP usage. On any `mcp__mcp-manager__mcpm` call to blueprint-extra, checks URL patterns and emits guidance. Rules:
  1. **V1 console = incognito**: BLOCKS if URL contains `xdr.trendmicro.com` — must use incognito, credentials in keyring (`v1-console/USERNAME`, `v1-console/PASSWORD`)
  2. **SSO/auth page detection**: Non-blocking warning about Playwright CDP alternative
  3. **SharePoint = new tab**: Non-blocking warning about SPA loading spinner
  4. **Tab hygiene**: Non-blocking reminder to check existing tabs before opening new ones
  Settings.json updated with `mcp__mcp-manager__mcpm` matcher. Credentials stored in keyring. 27 tests. Filed from cegp-screenshot session (2026-05-19).

- [x] T673: **PreToolUse: dashboard-deploy-reminder-gate.js** — Non-blocking. In `PreToolUse/llm-token-tracker/`. Emits reminder to stderr on Edit/Write to dashboard files. 15 tests.

- [x] T729: **PreToolUse: no-local-dashboard-gate.js** — Blocks Bash curls to local dashboard API endpoints. Allows operational proxy endpoints. 17 tests.

- [x] T730: **Fix portal-verify-gate.js false positive** — Per-line check instead of full-blob. 28 tests (4 new). Live gate synced.

- [x] T731: **Rename "wsl" workflow to "haiku-rules"** — Renamed in 15 module files, workflow-config.json (live), load-modules.js comments, CLAUDE.md, 5 test files, and live hooks.

## PRIORITY — Gate Fixes (user-directed 2026-05-22)

These must be done BEFORE any other work. Gates are blocking legitimate operations in other projects.

- [x] T732: **Extend file-content gates to cover Bash tool** — Enhanced `_bash-write-patterns.js` with `parseBashWrite()`, `extractTargetPath()`, `extractContent()` helpers. Extended `no-hardcoded-paths.js` (content check) and `no-rules-gate.js` (path check) to intercept Bash file mutations (echo >, printf >, cat heredoc, tee, cp, mv). 147 tests across 3 suites (87+35+25). Also fixed live gate-quality-gate.js naming check bug (was blocking edits to existing files — missing `isNewFile` guard).

- [x] T733: **portal-verify-gate.js — per-line matching** — Fixed in T730. COMPLETION_MARKERS now require line-start checkbox pattern. COST_MARKERS tightened (portal+match narrowed).

- [x] T734: **no-hook-bypass gate — whitelist TODO.md** — Fixed `extractTargetPath` to handle `>>` (append) correctly. TODO.md whitelist now works for both `>` and `>>`. Verified: bypass text in TODO passes, bypass text elsewhere blocks.

- [x] T735: **gate-quality-gate.js — false positive on project TODO files** — Removed `hook-runner/modules/` from Bash detection, kept only `hooks/run-modules/` and `.claude/hooks/run-modules/`. Edit/Write path still checks both. 20 tests.

- [x] T736: **All block messages must include WHY + NEXT STEPS — 74/102 compliant (was 29)** — Created `scripts/fix-block-messages.js` (Haiku-powered auto-fixer: reads WHY comment + current reason, calls Haiku to generate improved message, applies edit, verifies syntax). Three automated passes fixed 45 gates. Remaining 28 are inline `return {}` patterns and project-specific gates (ep-incident-response, hackathon26, ddei-email-security). Audit: `node scripts/audit-block-messages.js`.

- [x] T748: **Update test assertions for T736 block message changes** — Fixed ~50 test files across two sessions. Final result: 137→28 failures (65→10 suites). All 10 remaining suites are pre-existing failures (not from T736). Fixed 5 gates where Haiku generated wrong content: crlf-detector.js (restored dynamic filename+count), no-rules-gate.js (wrong message about contradictory instructions), git-rebase-safety.js (duplicated rebase msg for credential block), violation-gate.js (restored dynamic rule name), mandate-gate.js (restored dynamic mandate text).

- [x] T737: **haiku-client.js — send X-Caller-CWD header** — Added `X-Caller-CWD: process.cwd()` header to curl command in haiku-client.js. Quotes stripped from cwd value for header safety.

## Request Tracker Integration (dispatched from request-tracker, 2026-05-30)

- [x] T749: Superseded by T802. UPS runner already extracts and tracks requests via `.pending-requests-{session}.json`. UPS modules are banned (session lockout risk).

- [x] T750: Superseded by T744 (abandoned-request-check). Stop module reads `.pending-requests-{session}.json` and flags untracked requests. No external API needed.

API spec: See `~/Documents/ProjectsCL1/_grobomo/request-tracker/SPEC.md` for full endpoint docs. Server runs on :4101. Both modules should gracefully no-op if the server is unreachable (catch ECONNREFUSED, return null).

## Windows Path Fix + Test Cleanup (2026-05-30)

- [x] T753: **Fix Windows path resolution in 15 test suites** — Git Bash `pwd` returns `/c/Users/...` which Node.js can't resolve (needs `C:\Users\...`). Applied `pwd -W 2>/dev/null || pwd` pattern to all shell tests that pass paths to Node's `require()`. Also fixed `mktemp -d` temp dirs with `cd + pwd -W` conversion. Tests fixed: T091 (package.json fields for T703 reorg), T094 (11 missing modules in README), T204 (api-watcher.js hardcoded path → `API_CHECK_SCRIPT` env var), T554 (block message assertion), T621 (mandate-gate tmpdir + block message), T635 (api-watcher tmpdir), T655/T656 (event guard tmpdirs), T662 (portal-verify: added `PORTAL_EVIDENCE_PATH` env var for test isolation), T667 (stop-ordered: marker file path), T671 (dashboard-deploy: tmpdir + restored missing steps in block message), T726 (stop-fired-check: tmpdir + block message), T729 (no-local-dashboard: pwd), T740/T741 (transcript/debug: pwd + tmpdir). Result: 41→10 failures, 16→2 failing suites.

## Stop Rule Architecture (user-directed 2026-05-30)

- [x] T758: **Modular stop rules — split monolith into individual files** — 22 rules split from `stop-haiku-rules.yaml` into `rules/stop/01-*.yaml` through `22-*.yaml`. Auto-continue-gate loads from `~/.claude/proxy/stop-rules/` (directory preferred over monolith). Each file is self-contained (name, check, action). Disable via `_` prefix. 28 tests in `test-T758-modular-stop-rules.sh`.

- [x] T758b: **Fix todo-awareness rule — do ALL work, not just session-requested** — User directive: "do all the work, don't limit yourself to what I said in this session." Updated `todo-awareness` rule in stop-haiku-rules.yaml: removed restriction that backlog items from previous sessions don't count. ALL unchecked TODO items are now fair game for continuation.

## Stop Gate Audit (user-directed 2026-05-30)

- [x] T759: **Stop hook invisible in TUI — root cause: exit(0) on re-entrant calls** — The `stop_hook_active` re-entrant guard in run-stop.js was exiting with code 0, making the stop hook invisible in the TUI. Hook-health.jsonl showed pattern: `exit:0, stdout:0, stderr:51, ms:121` — the 51-byte stderr was just the "re-entrant, skipping" message with no stdout JSON. Fixed: (1) re-entrant guard now exits 1 with proper SELF-CHECK output, (2) ALL exit(0) paths removed from run-stop.js — unconditional exit(1), (3) new gate in hook-editing-gate.js blocks any edit containing `process.exit(0)` in hook modules. Live + repo synced.

- [x] T760: **Modularize stop rule: never-ask-user-to-click** — Now at `rules/stop/19-never-ask-user-to-click.yaml`. Part of T758 modular split.

- [x] T761: **Modularize stop rule: prove-systems-work** — Now at `rules/stop/20-prove-systems-work.yaml`. Part of T758 modular split.

- [x] T762: **Blueprint-only browser gate (PreToolUse)** — `blueprint-only-browser-gate.js`: blocks Bash commands using Selenium, Playwright, Puppeteer, ChromeDriver, Cypress, GeckoDriver. Allowlist for grep/find/version/help. Logging to hook-log.jsonl. 31 tests. Complements existing `no-playwright-direct.js` (which blocks MCP tool calls).

- [x] T763: **Update never-ask-user-to-click stop rule** — Updated: now only mentions Blueprint MCP. Selenium/pyautogui removed as browser options. If Blueprint fails, troubleshoot it.

- [ ] T765: **Blueprint SSO page interaction — false positive on fill_form** — Blueprint's `fill_form`, `interact`, and `evaluate` all fail on `login.microsoftonline.com` pages. `fill_form` reports "Filled 1 fields" but the value never reaches the DOM (false positive). `interact` returns "element not found". `evaluate` returns "Cannot access chrome-extension:// URL of different extension". Root cause: Chrome's debugger API is blocked on privileged/SSO domains. Fix options: (1) use `chrome.scripting.executeScript` API instead of debugger for SSO domains, (2) use content script injection, (3) detect SSO domains and report honestly instead of false-positive success. This blocks any Blueprint automation on MS login pages (device code flow, account picker, MFA).

- [x] T764: **Rename `wsl` workflow to `haiku-rules` (live sync)** — T731 renamed repo modules from `wsl` → `haiku-rules` but live hooks were never synced. 12 live modules still had `// WORKFLOW: wsl` — these were **completely non-functional** since `wsl` isn't in workflow-config.json. Fixed all 12: post-tool-use-gate, agent-quality-gate, continue-directive-gate, no-rewrite-gate, pre-tool-verify-gate, proxy-restart-gate, settings-watchdog-gate, todo-gate, load-instructions-gate, stop-hook-selftest-check, conscience-gate, archive/auto-continue-gate. Verified 0 wsl references remain.

## Dispatched from request-tracker (2026-06-01)

- [x] T766: **Fix stop hook TUI visibility** — Root cause was exit(0) on re-entrant calls (T759). Fixed. Verified with `scripts/stop-hook-verify.js` — all checks pass except re-entrant (acceptable). Stop hook IS visible in TUI: user confirmed seeing "Stop hook feedback:" messages.

- [x] T767: **Automated stop hook verification system** — `scripts/stop-hook-verify.js` checks 12 things: settings timeout, run-stop.js exists + no exit(0), required modules load, haiku modules load, last stop was visible, proxy reachable. `--fix` auto-repairs, `--summary` one-line injection. SessionStart module `stop-hook-verify-check.js` runs it on every session boot with `--fix --summary` — auto-heals and injects status. Live + repo installed.

- [x] T774: **REVERTED — Hook-runner API server archived** — `src/api-server.js` and `src/session-inbox.js` moved to `_archived-*`. User directive: fleet manager handles session management, not hook-runner. Hook-runner's job is gates, not APIs. (Historical note, not actionable.)

- [ ] T775: **tmux-based session management in WSL** — tmux 3.4 available in WSL, already running token-proxy session. Approach: run Claude Code sessions inside tmux windows in WSL. Use `tmux send-keys` to inject prompts into idle sessions — this actually wakes them (keystrokes into terminal), unlike file-based inbox which just sits there. Fleet manager (separate project) orchestrates via tmux. Hook-runner provides the gates, fleet manager provides the session control.

- [x] T767b: **Gate: hook-editing-gate must block exit(0) in run-stop.js re-entrant path change** — Added three protections: (1) detectWeakening skips exit(0) check when content includes stop_hook_active (re-entrant guard is correct), (2) Edit check blocks exit(1)+stop_hook_active in same snippet, (3) Write check scans forward from stop_hook_active for first process.exit — blocks if exit(1). 37 tests (5 new). Live + repo synced.

- [x] T768: **Stop rule: catch "fixed" claims → require prevention gate** — Added `fix-needs-gate` rule to stop-haiku-rules.yaml. When Claude claims to have "fixed" something without creating a gate (or gate TODO), Haiku triggers CONTINUE. Exceptions: trivial typos, docs, config changes. Live + repo synced.

- [x] T776: **REVERTED — Session inbox archived** — File-based inbox is no better than writing TODO.md. Real solution is tmux `send-keys` via fleet manager (T775). Archived to `src/_archived-session-inbox.js`. (Historical note, not actionable.)

- [x] T769: **Stop rule: detect behavioral corrections → auto-create gate** — Added `correction-to-gate` rule to stop-haiku-rules.yaml. When user corrects Claude's behavior ("no, do X", "stop doing Y", "wrong approach"), Haiku triggers CONTINUE to create a gate TODO. Live + repo synced.

- [x] T770: **UPS hook: TODO-first reminder** — CLOSED: UPS modules are prohibited by design (any bug locks user out of session). Already enforced by `todo-gate.js` (PreToolUse) which blocks code changes when no TODO items are open.

- [x] T771: **PreToolUse gate: block code changes without open TODO** — Already implemented as `todo-gate.js` (live at ~/.claude/hooks/run-modules/PreToolUse/). Blocks Edit/Write/Bash when TODO.md has no unchecked items.

- [x] T772: **Gate: cross-project TODO file pollution** — Already implemented as `cross-project-todo-gate.js`. Detects cross-project markers, path references, and cross-project phrases in TODO content.

- [x] T773: **Audit enforcement tiers — gates vs rules vs memory** — Audit complete:
  **Part 1 (native memory ban)**: Clean. Global `~/.claude/rules/` empty, no MEMORY.md, no memory dir. `no-native-memory-gate` enforces. Workspace rules (ProjectsCL1/.claude/rules/) contain 3 operational guidance files (coconut-mailbox, kubeconfig, session-continuity) — not behavioral enforcement, fine as-is.
  **Part 2 (stop rule ↔ gate mapping)**: 10/22 rules are gate-backed, 12/22 are judgment-only. Gate-backed: never-give-up, todo-awareness, cross-project-dispatch, specs-need-docs-and-tests, e2e-before-done, todo-maintenance, never-stop-uncertain, user-instruction-override, prove-systems-work, correction-to-gate. Judgment-only rules are correct — they require LLM understanding of context/intent (e.g., never-ask-permission, suggest-context-reset, incomplete-delivery, obvious-follow-up).
  Philosophy documented in CLAUDE.md "Enforcement Philosophy: Gates > Rules > Memory" section.

## Decision Logging (user-directed 2026-06-01)

WHY THIS MATTERS: Claude makes behavioral changes (exit codes, gate logic, stop rules) across sessions without documenting WHY. When these changes break things, there's no audit trail — just a broken system and a user who has to debug it. The T759 exit(0) disaster happened because a previous session "decided" to suppress re-entrant output without logging the reasoning. Gates are the only way to enforce documentation across context resets. Promises don't survive sessions. Gates do.

- [x] T777: **Decision log gate (PostToolUse)** — `decision-log-gate.js`: detects Edit/Write to hook infrastructure (modules, runners, core, stop-rules, proxy config). Warns via stderr if no matching `decisions.jsonl` entry exists for the current session. Non-blocking (warning only). Shows exact JSON format to write. 14 tests. PreToolUse blocking companion deferred (warning is sufficient for now — blocks are too disruptive during active development).

- [x] T778: **SessionStart: unauthorized-change-check.js** — On boot, SHA256-hashes key hook infrastructure files (runners, core, stop-rules) and compares against `snapshot-hashes.json`. Cross-references changes with `decisions.jsonl` (7-day window). Undocumented changes flagged via stderr. Creates baseline on first run. 5 tests. Auto-repair deferred (warning is sufficient first step).

## Verification Gate (user-directed 2026-06-01)

- [x] T782: **PostToolUse: verify-todo-completion-gate.js** — When Claude marks a TODO as done, extracts file references and expected content from the description, verifies files exist and contain claimed changes. Warns via stderr if verification fails. Handles full paths (Windows+Unix) and bare filenames. Non-blocking. 12 tests. Catches the T758b failure pattern: TODO marked done but fix never applied.

- [x] T783: **Fix mandate-gate false positive on DONE** — Added decision check: DONE/DISPATCH mandates are cleaned up and skipped, only CONTINUE/NEXT mandates block. Also fixed block message formatting (FALSE POSITIVE line was concatenated in mid-message). 4 new tests (T783 section). Dispatched from request-tracker.

- [x] T784: **Stop hook infra-safety-net false positive on short responses** — Already fixed in auto-continue-gate.js. Logic: (1) absent text → transcript fallback → infra-safety-net only if still empty, (2) short text from indirect source → try transcript for longer version, (3) short but present messages (from input) proceed to Haiku normally. The `inputHadMessage` flag distinguishes direct input from indirect sources.

## Dispatched from request-tracker (2026-06-01, batch 2)

- [x] T785: **Audit all rules + gates** — Built reusable `scripts/audit-gates.js` (--json, --summary modes). Results: 155 modules (+ 5 helpers), 122/155 have tests (79%), 153/155 live deployed (99%), 101/108 blocking gates have FP escape (94%), 22/22 stop rules valid. Top gaps: 120 modules lack hook-log.jsonl logging, 124 lack INCIDENT HISTORY, 33 lack tests. Report saved to `audit-report-2026-06-02.txt`. Follow-up work: add logging/incident-history to existing modules (bulk improvement, low priority).

- [ ] T786: **Unified gate architecture at every hook event** — Replicate Stop hook's two-layer pattern (1-haiku/ semantic + 2-mechanical/ deterministic) to ALL hook events: PreToolUse, PostToolUse, UserPromptSubmit, SessionStart. Each event gets: (1) `{event}-haiku-rules.yaml` for semantic Haiku analysis, (2) `run-modules/{Event}/` for mechanical gates. Stop already has this. PreToolUse cost optimization: only fire Haiku on state-changing tools (Edit/Write/Bash), skip read-only (Read/Glob/Grep).

- [x] T787: **Design for autonomous operation** — DONE. Audit complete: only 1 module had "ask the user" in a block message (hook-system-reminder.js — fixed). 5 stop rules enforce autonomy: #01 never-ask-permission, #14 never-stop-uncertain, #19 never-ask-user-to-click, #23 expert-decides-implementation, #28 priority-enforcement. No module waits for user input. T798 stop rules add quality review without user involvement.

- [x] T788: **script-not-oneoff-check** — PostToolUse module that detects inline scripts >10 substantive lines (Python, Node.js, heredoc, Perl, Ruby, Bash) and emits stderr advisory to extract to a script file. Non-blocking, deduped per session, logs to hook-log.jsonl. 20 tests. Deployed live. UPS version skipped per CLAUDE.md "UserPromptSubmit = ZERO modules allowed" rule.

## Dispatched from request-tracker (2026-06-01, batch 4)

- [x] T791: **Audit trail enforcement gates (starter workflow)** — All 3 gates built and deployed: (1) `audit-log-protect-gate.js` — blocks deletion/truncation of JSONL logs AND Write tool overwrite of JSONL files (covers append-only enforcement). 26/26 tests. (2) `git-commit-reminder-check.js` — PostToolUse reminds to commit TODO.md/docs/specs/CHANGELOG changes. 15-min cooldown. 15/15 tests. Both deployed to live.

## Dispatched from request-tracker (2026-06-01, batch 3)

- [x] T789: **Design "autonomous" workflow** — DONE. Created `workflows/autonomous.yml` extending `haiku-rules`. Groups 14 modules for unattended operation: reflection-first-gate, correction-to-gate-check, false-positive-followup-gate, user-correction-detector, rca-write/read-check, script-not-oneoff-check, automate-everything-gate, self-reflection, reflection-score, self-healing-gate, test-before-done, troubleshoot-detector, empty-output-detector. Disabled by default (enable when running unattended). Deployed to live.

- [x] T790: **Workflow analysis + cleanup** — CRITICAL FINDING: Only `haiku-rules` workflow is enabled in workflow-config.json. `shtd`, `gsd`, `starter` all disabled. Result: 126/155 modules (81%) were dead — including safety-critical gates (force-push, git-destructive, hook-editing, secret-scan). FIX: Added `haiku-rules` tag to 26 safety-critical modules across PreToolUse (18), PostToolUse (4), Stop (4). Active modules now 52 (was 26). Live hooks synced. All tests pass. Audit script: `scripts/audit-gates.js`. Remaining 100+ dead modules are development-discipline gates (branch-pr, spec-before-code, etc.) — fine to leave disabled until `shtd`/`gsd` workflows are re-enabled.

## Watchdog Issues (auto-generated 2026-05-30)

### T999: Dispatched from claude-fleet
- [x] Test dispatch from fleet — fleet dispatch infrastructure validated by T-E2E-TEST (closed)
- Dispatch ID: `d-mpvp0sz2-4bxj`

## False Positive Fixes (2026-06-01)

- [x] T779: **Allow mv/rename from hook-runner project** — Two gates fixed: (1) `hook-editing-gate.js`: added cwd fallback when `CLAUDE_PROJECT_DIR` is empty (was always empty). (2) `gate-quality-gate.js`: added hook-runner project detection + `mv` exception. Remaining: `no-rewrite-gate` still blocks `mv` as "file overwrite" even when target doesn't exist — deferred. Old `no-rules-gate.js` left as harmless no-op (returns null).

- [x] T780: **Block message standard: add FALSE POSITIVE escape hatch** — Added `FALSE POSITIVE? File a TODO in hook-runner: "Fix {gate-name} — {describe the issue}"` to 101/109 blocking gates. `scripts/add-false-positive-line.js` automated 93 gates (167 reason strings). 8 manual fixes for variable-based block messages (no-native-memory-gate, tunnel-check-gate, blueprint-guidance-gate, reflection-gate, unresolved-issues-check, no-local-dashboard-gate, dashboard-deploy-verify-gate, screenshot-public-site-gate). 8 excluded: archived/example (3), SELF-CHECK outputs (4), user-authored stop-message (1). Updated `audit-block-messages.js` with FP tracking. 0 syntax errors, 3135 tests pass.

- [x] T784: **Test suite fixes — 53→8 failures** — Fixed 13 test suites:
  - `no-rules-gate` → updated require path to `no-native-memory-gate.js`
  - `e2e-enforcement` → updated module reference
  - `settings-hooks-gate` → added `type: prompt/agent` to hookPatterns regex, fixed `cat` false positive in Bash detection
  - `gate-quality-bash` → updated mv test for T779 exception
  - `workflow-modules` → updated 3 workflow YAMLs (`gsd.yml`, `shtd.yml`, `starter.yml`)
  - `portable-paths` → removed hardcoded `ProjectsCL1` from `no-native-memory-gate.js` and `stop-hook-verify-check.js`
  - `install-drift` → cleaned stale `_archived-no-rules-gate.js` from live hooks
  - `hook-lock` → fixed `isHookRunnerProject()` to prioritize `CLAUDE_PROJECT_DIR` over `cwd` when set
  - `stop-run-all` → updated grep patterns for T759 changes
  - `stop-ordered-execution` → updated exit code test for T759
  - `stop-health-report` → updated re-entrant test for T759 silent exit
  - `diagnose` → resolved by stale module cleanup
  - Remaining 2 suites: `T094-module-docs` (README docs), `T636-haiku-judge` (env-dependent mock server)

- [x] T781: **PostToolUse: file-naming-check.js** — Non-blocking PostToolUse module. On Edit/Write to source files, uses L1 (Haiku) to check if filename matches code purpose. Filters: source extensions only, skips node_modules/.git/test files/short names/underscore-prefixed, deduplicates per session, skips files <100 or >15000 chars. High-confidence mismatches emit stderr warning with suggested name. 17 tests in `test-file-naming-check.js`.

### T-E2E-TEST: Dispatched from claude-fleet [DONE]
- [x] End-to-end fleet dispatch test — mark this DONE to complete the test
- Dispatch ID: `d-mpvsc7qu-vvn8`

### T792: Dispatched from request-tracker — URGENT — shtd workflow is broken
- [x] T792: **Fix spec-gate: shtd enabled but not enforcing** — Added TODO.md check to `shouldActivate()`. Projects with unchecked TODO items now activate the gate even without `specs/`. 12 tests pass. Synced to live.

  **Root cause**: `shouldActivate()` checks for `specs/` dir existence and returns false if missing. When shtd workflow is `enabled: true`, the gate should ALWAYS activate. Missing `specs/` should be a BLOCK ("create specs/ first"), not an exemption.

  **Spec location**: Specs should be searched in BOTH `specs/` (legacy) and `docs/specs/` (preferred — keeps all docs together alongside `docs/vision/`). The gate should accept either location. New projects should use `docs/specs/`.

  **Required changes to `spec-gate.js`**:

  1. Add helper to check if shtd workflow is explicitly enabled:
  ```javascript
  function _isShtdWorkflowEnabled() {
    try {
      var wfPath = path.join(os.homedir(), ".claude", "hooks", "workflows", "shtd.yml");
      var content = fs.readFileSync(wfPath, "utf-8");
      return /^enabled:\s*true/m.test(content);
    } catch (e) { return false; }
  }
  ```

  2. Fix `shouldActivate()` — when shtd is enabled, always return true:
  ```javascript
  function shouldActivate(projectDir) {
    if (process.env.SPEC_GATE_ACTIVE === "1") return true;
    if (!projectDir) return false;
    if (projectDir in _cache.autoActivated) return _cache.autoActivated[projectDir];
    // When shtd workflow is explicitly enabled, ALWAYS activate.
    if (_isShtdWorkflowEnabled()) {
      _cache.autoActivated[projectDir] = true;
      return true;
    }
    // ... rest of auto-activation for non-shtd projects unchanged ...
  }
  ```

  3. Update spec directory scanning — component-based structure:
  ```javascript
  // Scan docs/<component>/specs/<feature>/spec.md (preferred)
  // AND legacy specs/<feature>/spec.md (backwards compat)
  var specsDirs = [];
  var docsDir = path.join(root, "docs");
  if (fs.existsSync(docsDir)) {
    // Each subdirectory of docs/ is a component; check for specs/ within
    fs.readdirSync(docsDir).forEach(function(comp) {
      var compSpecs = path.join(docsDir, comp, "specs");
      if (fs.existsSync(compSpecs) && fs.statSync(compSpecs).isDirectory()) {
        specsDirs.push(compSpecs);
      }
    });
  }
  var rootSpecs = path.join(root, "specs");
  if (fs.existsSync(rootSpecs)) specsDirs.push(rootSpecs);
  ```

  4. Fix the enforcement logic (line ~489) — when shtd is enabled and no spec dirs exist, block with instruction to create it instead of falling back to TODO.md:
  ```javascript
  // Currently: no specs and no TODO → block. no specs but TODO → allow.
  // Fixed: when shtd enabled and no specs → BLOCK regardless of TODO.md.
  if (specEntries.length === 0 && _isShtdWorkflowEnabled()) {
    return {
      decision: "block",
      reason: "BLOCKED: shtd workflow requires specs\n" +
        "WHY: shtd enforces spec-first development. TODO.md alone is not sufficient.\n" +
        "NEXT STEPS:\n" +
        "1. mkdir -p docs/specs/\n" +
        "2. Create docs/specs/<feature>/spec.md describing WHAT and WHY\n" +
        "3. Create docs/specs/<feature>/tasks.md with unchecked task items\n" +
        "4. Then implement"
    };
  }
  ```

  4. Similarly, when shtd is enabled and on main branch, the TODO.md fallback (line ~609-627) should NOT bypass the spec requirement. TODO.md is a task tracker, not a spec.

  **Test cases needed**:
  - shtd enabled + no specs/ → BLOCK
  - shtd enabled + specs/ exists + no spec.md → BLOCK
  - shtd enabled + spec.md + no tasks.md → BLOCK
  - shtd enabled + full chain → ALLOW
  - shtd disabled + no specs/ → dormant (current behavior preserved)
  - shtd enabled + TODO.md only (no specs/) → BLOCK (not allow)

### T794: Dispatched from request-tracker — shtd enforcement architecture is inverted
- [x] T794: **CRITICAL: shtd gates bypass enforcement when prerequisites are missing** — Built `_shtd-enforce.js` shared helper with `requirePrereq(projectDir, prereqPath, opts)`. When shtd is enabled and prerequisite is missing, blocks with creation instructions. When shtd disabled, dormant. Audited enforcement-gate — no inversion bug (correctly blocks when TODO.md missing). 8/8 tests. Deployed to live. Remaining: integrate into spec-gate and future shtd gates.
  - `spec-gate`: dormant when `specs/` missing (T792 fix)
  - `vision-doc-gate`: doesn't exist yet (T793 to create)
  - `enforcement-gate`: needs audit — does it have the same inversion?
  - Any future shtd gate risks the same pattern unless the architecture prevents it

  **Design principle to enforce**: When shtd workflow is enabled, EVERY gate in the workflow MUST block when its prerequisite is missing. "Missing prerequisite = BLOCK with creation instructions" is the ONLY correct behavior. "Missing prerequisite = dormant/skip" is ALWAYS a bug.

  **Implementation**: Add a shared helper (`_shtd-enforce.js` or add to `_helpers.js`) that all shtd gates call:
  ```javascript
  function shtdEnforce(prereqPath, prereqName, createInstructions) {
    if (!_isShtdWorkflowEnabled()) return null; // dormant when shtd disabled
    if (fs.existsSync(prereqPath)) return null; // prerequisite exists, proceed
    return { decision: "block", reason: "BLOCKED: shtd requires " + prereqName + "..." };
  }
  ```
  This makes the correct behavior the DEFAULT. A gate author would have to deliberately bypass it to get the wrong behavior.

  **Cross-references**: T792 (spec-gate fix), T793 (vision-doc-gate), T51 (gate audit should flag this pattern)

### T793: Dispatched from request-tracker — vision-doc-gate for shtd workflow
- [x] T793: **New gate: vision-doc-gate (PreToolUse, shtd workflow)** — Built `vision-doc-gate.js`. Enforces `docs/<component>/vision.md` OR `docs/vision/<component>.md` exists before Edit/Write to source files. Uses `_shtd-enforce.js` — dormant when shtd disabled or no `docs/` dir. Component extracted from first directory in project-relative path. Extensive exemptions (tests, configs, docs, specs, meta files). 35 tests. Deployed to live.

  **Difference from spec-gate**:
  - **spec-gate** = WHAT and HOW for a single task. "Add a cleanup command with --kill flag." Scoped, tactical.
  - **vision-doc-gate** = WHY and WHERE for a system component. "The health monitor exists because X. It should do Y. Decision framework: Z." Strategic, architectural.
  - Spec gates fire on every source file edit. Vision gates fire on architectural changes (new components, new commands, new systems).

  **Docs structure** (component-based, not flat):
  ```
  docs/
  ├── <component>/          ← one folder per system component
  │   ├── vision.md         ← WHY this component exists (enforced by vision-doc-gate)
  │   └── specs/            ← task specs for this component (enforced by spec-gate)
  │       └── <feature>/
  │           ├── spec.md
  │           └── tasks.md
  ```
  Vision and specs for the same component are co-located. Navigate to a component → see WHY it exists + all work done on it.

  **Trigger conditions** (Edit/Write to source files):
  1. Creating a new file in a directory that maps to a component without `docs/<component>/vision.md`
  2. Adding a new exported function/command to a component without vision coverage
  3. Creating a new `docs/<component>/` directory (vision.md is required before specs)

  **Detection approach** (PreToolUse):
  - Scan `docs/*/vision.md` to build a map of documented components
  - Map the target file to its component (by directory name, keyword match, or explicit mapping in a config file)
  - If component has no vision.md → BLOCK

  **Block message when no vision doc**:
  ```
  BLOCKED: New component without vision doc
  WHY: Building systems without documenting WHY they exist leads to tools that solve
  the wrong problem. Vision docs capture the intent so future sessions understand
  the design, not just the code.
  NEXT STEPS:
  1. Create docs/vision/<component>.md with:
     - The Problem: what's broken or missing
     - The Vision: what it should look like
     - How It Works: architecture/data flow
     - Decision Framework: what it does vs delegates (if applicable)
  2. THEN write the spec for the specific task
  3. THEN implement
  ```

  **Exemptions**:
  - Test files, config files, docs themselves
  - Bug fixes to existing code (Edit to existing functions)
  - Files in projects without `docs/vision/` dir AND shtd not enabled (auto-activation respects same rules as spec-gate)

  **Add to shtd.yml modules list**: `- vision-doc-gate`

### T795: Dispatched from request-tracker — starter workflow safety gate
- [x] T795: **process-kill-gate (PreToolUse, starter workflow)** — Built and deployed. Blocks killall, pkill, taskkill /f /im, Stop-Process, kill -9 -1/0. Allows specific PIDs (>0), process listings, dry-runs. 27 tests pass. Live.
  **Trigger**: Bash commands matching `taskkill`, `kill`, `pkill`, `killall`, `Stop-Process`, or scripts containing these (e.g. `close-dead-tabs.ps1`)
  **Block when**: Command kills by pattern/bulk (no specific PID list verified), OR kills without `--dry-run`/preview first, OR targets the current session's own PID tree
  **Allow when**: Command targets specific known-stale PIDs that were listed in a previous tool call (Claude already saw what it's killing)
  **Block message**: "BLOCKED: Process termination without target verification. List targets first with a dry-run, then kill specific PIDs."
  **Log**: All kill attempts to hook-log.jsonl with PIDs targeted
  **Why**: Claude ran `close-dead-tabs.ps1` and killed its own session. Basic safety = verify targets before destruction.

### T796: Dispatched from request-tracker — WORKFLOW REORGANIZATION
- [x] T796: **Rename, reorganize, and deduplicate all workflows** — DONE. Step 3: `extends:` support (load-modules.js, 8 tests). Step 4: Deduplicated shtd.yml and gsd.yml — removed 47 modules from each that were duplicates of starter (inherited via `extends: starter`). Both now 59 own modules + 47 inherited = 106 effective (same as before). No modules lost. Bumped shtd to v4, gsd to v3. Also fixed no-rewrite-gate: `.rewrite-approved` sidecar override was documented but never implemented — added check+consume logic. Deployed to live. Remaining: rename starter→core, fold cross-project-reset into starter, remove dead wsl workflow.

  **New structure** (extends = inherits parent's modules):

  | New Name | Was | Modules (own) | Extends | Purpose |
  |----------|-----|---------------|---------|---------|
  | `core` | starter | ~50 | — | Non-negotiable safety. CANNOT be disabled. Destructive guards (force-push, git-destructive, archive-not-delete, process-kill, secret-scan), messaging safety, cross-project boundaries. |
  | `dev-discipline` | shtd | ~30 | core | Spec-first: spec-gate, vision-doc-gate, branch-pr, commit quality, test-before-done, why-reminder |
  | `gsd` | gsd | ~20 | core | GSD phase-based: ROADMAP/phase flow, planning gates |
  | `fleet` | dispatcher-worker | ~10 | core | Fleet ops: cross-project dispatch, session lifecycle, session-collision |
  | `customer-guard` | customer-data-guard | ~4 | core | Read-only customer envs |
  | `no-docker` | no-local-docker | ~3 | core | Block local Docker |
  | `self-management` | haiku-rules + autonomous (T57) | ~20 | core | Haiku-powered self-correction: stop rules, auto-continue, todo-awareness, never-ask-permission, context-reset decisions, self-healing. All the "Claude manages itself" logic. |

  **Removed**: `wsl` (0 modules, dead), `cross-project-reset` (fold 4 modules into core)

  **Core has `enabled:` like everything else** — user may need to disable it for debugging, testing gates, or working in constrained environments. It's the default-on safety floor, but the user controls it.

  **Key principle**: Each workflow only declares modules UNIQUE to its purpose. Safety modules are inherited from `safety`, not duplicated. A workflow's module list should be ~10-30, never 113.

  **Implementation**:
  1. Create new YAML files with `extends: safety`
  2. Remove duplicate module entries (keep only unique-to-workflow modules)
  3. Update `loadModules()` to resolve `extends` chains
  4. Verify no module is orphaned (exists in old workflow but not in new)
  5. Each workflow gets `docs/<workflow>/vision.md` explaining WHY it exists

### T797: Dispatched from request-tracker — Haiku UPS rule for spec/vision enforcement
- [ ] T797: **UPS Haiku rule: classify whether spec/vision docs are needed before code changes** — At UserPromptSubmit time, Haiku analyzes the user's prompt and classifies:

  | Classification | Trigger | Action |
  |---------------|---------|--------|
  | `one-off` | Simple fix, typo, config tweak, answering a question | TODO entry required (spec-before-code-gate enforces this). No spec/vision needed. |
  | `task` | Implementing a defined TODO item, bug fix with clear scope | TODO entry required + spec REQUIRED (`docs/<component>/specs/<task>/spec.md`) |
  | `feature` | New capability, new command, new system | TODO + spec + vision ALL REQUIRED. Block until all three exist. |
  | `architecture` | Changing how components interact, reorganizing structure, modifying gates/workflows | TODO + vision REQUIRED. Spec per affected component. |

  **Key rule**: dev-discipline ALWAYS enforces documented intent before code. The classification only determines HOW MUCH documentation is needed, never WHETHER documentation is needed. Zero project file edits without at least a TODO entry.

  **Rule in `userprompt-haiku-rules.yaml`**:
  ```yaml
  - name: spec-vision-classifier
    trigger: "User prompt implies work that will create or modify files"
    action: |
      Classify the work scope: one-off, task, feature, or architecture.
      Write classification to l1-analysis.md so spec-gate and vision-doc-gate
      can use it. Include: classification, component name, expected doc paths.
  ```

  **Why UPS not PreToolUse**: Fires once per prompt (cheap), not per tool call. Haiku sees the full user intent and can judge scope. PreToolUse only sees individual file edits — can't distinguish "fixing a typo" from "building a new system."

  **Integration with spec-gate**: spec-gate reads l1-analysis.md classification. If `feature` or `architecture`, block without spec/vision. If `one-off`, skip enforcement. If `task`, warn but don't block.

### T798: Dispatched from request-tracker — CRITICAL — Haiku as supervisor, not traffic cop
- [x] T798: **Redesign stop hook: Haiku replaces user as quality reviewer** — DONE. All 7 stop rules built and deployed: #24 band-aid-detection (session h), #25 destructive-action-review (session h), #26 system-health-awareness, #27 gate-block-followthrough, #28 priority-enforcement, #29 spec-before-code-review, #30 gate-effectiveness-audit. 30 active stop rules total. Test suite updated (count threshold, CORRECT verb). 672/0 tests pass.

  **New stop rule categories** (add to `stop-haiku-rules.yaml`):

  1. **system-health-awareness**: Check process count, tab count, RAM. If abnormal AND Claude hasn't addressed it, emit CORRECT: "You have N stale processes. Run cleanup before continuing."

  2. **gate-block-followthrough**: After any gate blocks with "FALSE POSITIVE? File a TODO in hook-runner", check if Claude filed it. If Claude dismissed it and moved on, emit CORRECT: "You ignored a false positive instruction. File the TODO now. Gate maintenance is higher priority than feature work."

  3. **destructive-action-review**: If Claude ran a destructive command (kill, delete, cleanup script) without first running a dry-run/preview, emit CORRECT: "You ran a destructive action without preview. This is how you killed your own tab. Always preview first."

  4. **band-aid-detection**: If Claude is implementing a one-off fix for a recurring problem instead of a systematic solution, emit CORRECT: "This is a band-aid. Design a repeatable fix."

  5. **priority-enforcement**: Compare what Claude is working on vs TODO.md priorities. If Claude is doing low-impact work while high-impact items are pending, emit CORRECT: "T51 (gate audit) is CRITICAL. You're reorganizing docs. Reprioritize."

  6. **spec-before-code-review**: If Claude wrote code without specs/vision docs first, emit CORRECT: "You built X without documenting WHY. Write the vision doc first."

  7. **gate-effectiveness-audit**: Periodically check if enabled gates are actually firing. If a gate is enabled but has 0 entries in hook-log.jsonl, it's probably broken (like spec-gate was).

  **New stop decision type**: `CORRECT` — like CONTINUE but with specific corrective action. Gets written to `l1-analysis.md` so the NEXT prompt has the correction injected. Claude cannot ignore it because it's in the context window.

  **Architecture**:
  ```
  Stop hook fires
    → Haiku reviews: last response + TODO.md + hook-log + health metrics
    → Decision: DONE | CONTINUE | NEXT | CORRECT
    → If CORRECT: write correction to ~/.claude/hooks/.pending-corrections.json
    → UPS rule reads pending corrections, injects into l1-analysis.md
    → Corrections persist until Claude addresses them (append-only, cleared on resolution)
  ```

  **Goal**: User should not need to be present. Haiku catches the same patterns the user catches — ignored false positives, wrong priorities, band-aid fixes, destructive actions without preview, broken gates. Eventually the user sets the vision and Haiku enforces it.

### T800: Dispatched from request-tracker — gate design principles
- [x] T800: **Enforce gate placement rules** — DONE via T803. PostToolUse runner never propagates blocks (run-posttooluse.js). 15 PostToolUse modules still return `decision:"block"` but these are treated as logged warnings, not actual blocks. Principles documented in CLAUDE.md "Hook Design Rules" section:
  - **PreToolUse** = BLOCKING. Prevents bad actions. If it must be stopped, it's here.
  - **PostToolUse** = NON-BLOCKING. Observes, warns, logs. Never blocks.
  - **UserPromptSubmit** = CONTEXT. Classifies work, injects corrections. Never blocks.
  - **Stop** = SESSION. Reviews quality, checks TODO state, forces continue. Blocks only to prevent premature stop.

  Audit every existing PostToolUse module — if any are blocking enforcement that should prevent an action, move to PreToolUse. This applies retroactively to T51 (full gate audit).

### T802: Dispatched from request-tracker — TODO-first enforcement via UPS+PreToolUse handshake
- [x] T802: **Force user requests into TODO.md before ANY work begins** — DONE. Two-part system: (1) UPS runner now asks Haiku to extract `requests` array from user prompt, writes to `.pending-requests-{session}.json`. (2) PreToolUse `todo-first-gate.js` blocks Edit/Write/Bash until all requests are tracked in TODO.md. Auto-clears when keywords match. 30-min expiry. Read-only tools pass through. 28 tests. Deployed. Original spec:

  **Gate 1: UPS Haiku rule** (`userprompt-haiku-rules.yaml`):
  - Haiku reads user's prompt, extracts actionable requests (not questions, not acknowledgments)
  - Writes extracted requests to `~/.claude/hooks/.pending-requests-{session}.json`:
    ```json
    {"requests": ["fix the shtd gate", "rename starter to core"], "ts": "...", "prompt_preview": "..."}
    ```
  - If no actionable requests found, writes empty array (clears the lock)

  **Gate 2: PreToolUse mechanical gate** (`todo-first-gate.js`):
  - On every tool call, reads `.pending-requests-{session}.json`
  - If requests exist AND they're not yet in TODO.md:
    - ALLOW: Edit/Write to TODO.md (Claude is adding the requests)
    - BLOCK everything else: "Add pending requests to TODO.md first: [list]"
  - Once all requests are found in TODO.md (fuzzy match on keywords), clears the lock
  - Normal tool calls resume

  **Why this works**: Claude cannot start coding until every user request is tracked. No more "I'll do that later" or "moving on to real work." The TODO file is the contract.

### T803: Dispatched from request-tracker — Move blocking PostToolUse modules to PreToolUse
- [x] T803: **PostToolUse runner no longer propagates block decisions** — Instead of editing 11 modules, fixed the runner itself: `run-posttooluse.js` no longer writes block JSON to stdout or exits with code 1. Module block decisions are still logged to hook-log.jsonl and printed to stderr (visible to Claude), but NOT propagated to Claude Code as actual blocks. PostToolUse monitors — it never blocks. Deployed to live.

### T814-T821: Dispatched from request-tracker — 8 gates from session corrections

- [x] T814: **Fix frustration detector patterns** — Added 14 new patterns: profanity (fuck/shit/damn/motherfucker/hell), ALL CAPS (>50% ratio, min 4 letters), quality complaints (terrible/awful/garbage/stupid/dumb/useless), direct contradictions (NO/wrong!/stop!), punctuation spam (3+ !/?) , meta (tell me why), quality phrases (what a mess/joke, meaningless jargon). Min prompt length lowered 5→2. 48/48 tests pass. Deployed to live.

- [x] T815: **dispatch-spawn-check.js** — DONE. PostToolUse module. After manage.py poll/status/heartbeat, detects pending dispatches to projects (regex + JSON patterns). Emits advisory to check fleet and spawn sessions. 21 tests.

- [x] T816: **self-analysis-check.js** — DONE. PostToolUse module. After poll/health/status commands, checks frustration-log freshness, self-healing findings, watchdog stop mismatches. Emits health signals to stderr. 17 tests.

- [x] T817: **Gate: "needs to change" → gate spec required** — DONE. PostToolUse `gate-spec-required-check.js`. When TODO.md edit contains 2+ behavioral patterns (always/never/must/enforce/block when/check when/etc.) but lacks gate spec indicators (event type, trigger, block message), emits warning. Non-blocking. 16 tests. Deployed.

- [x] T818: **Gate: follow false positive instructions** — Built `false-positive-followup-gate.js` (PostToolUse). Scans hook-log.jsonl for recent PreToolUse blocks with "FALSE POSITIVE" in reason. Tracks pending blocks in session-scoped state file. After 3 tool calls without filing a TODO in hook-runner, emits warning. 30-min cooldown, dedup per block. 28 tests. Deployed to live.

- [ ] T819: **Gate: use existing scripts** — PreToolUse mechanical. Read MANIFEST.json or scan manage.py COMMANDS dict. If bash command reimplements existing script, block: "Use: python manage.py {command}"

- [x] T820: **Gate: corrections must produce gate specs** — Built `correction-to-gate-check.js` (PostToolUse). Reads `correction-log.jsonl` for recent corrections (15-min window). On TODO.md edits, checks for gate spec indicators (event type, trigger, block message — needs 2+ indicators). Warns if correction detected but TODO is prose-only. Dedup per correction batch. 21 tests. Deployed to live.

- [x] T821: **Meta-gate: enforce that THIS pattern continues** — Superseded by T817 (gate-spec-required-check) + T820 (correction-to-gate-check). Together they enforce: behavioral TODOs need gate specs (T817), and corrections need gate specs (T820). The recursive case is covered — T817 fires on its own TODO edits too.

### T824: SessionStart gate — auto-setup cron for autonomous dispatch cycle
- [x] T824: **Superseded by T843** — dispatcher-cron-check.js implements this.

  **Implementation**: SessionStart module checks if `manage.py` exists in `CLAUDE_PROJECT_DIR` with a `supervise` command. If yes, outputs JSON to stdout that triggers CronCreate:
  ```json
  {"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "Set up autonomous dispatch cron: CronCreate every 3 minutes running manage.py poll + email-poll + supervise"}}
  ```

  The module itself can't call CronCreate (it's a Claude Code tool, not a shell command). But the additionalContext injection tells Opus to create the cron as its first action. Alternative: the module writes a flag file (`~/.claude/hooks/.cron-needed-{session}.json`) and a UPS gate reads it on the first prompt, injecting a reminder.

  **Scope**: Only for projects with `manage.py supervise`. Other projects don't need the cron.

### T833: Dispatched from request-tracker — todo-awareness should recognize dispatched items
- [x] T833: **Stop rule `todo-awareness` keeps suggesting dispatched TODOs** — Fixed by T834: `readTodo()` now filters dispatched items before passing to Haiku. The `todo-awareness` rule only sees actionable-in-this-session items.

### T832: Dispatched from request-tracker — CRITICAL: Stop hook timeout
- [x] T832: **URGENT: Stop hook timeout is 5s, needs 30s** — Fixed previous session. Timeout increased from 5s to 20s via `scripts/fix-stop-timeout.js`. Root cause confirmed: `hook-health.jsonl` showed stop runs taking 10-14s but Claude Code killing at 5s. Output now visible in TUI after session restart.

### T831: Dispatched from request-tracker — CRITICAL: Self-kill prevention gate
- [x] T831: **PreToolUse mechanical gate: block any command that kills the calling session's own PID** — Extended `process-kill-gate.js` with three layers: (1) block dangerous scripts like `close-dead-tabs.ps1` unconditionally, (2) self-kill detection via `getOwnPids()` that walks up the process tree via WMIC, (3) `extractTargetPids()` parses kill/taskkill/Stop-Process commands. Own PID, parent PID, and CLAUDE_PID all protected. 38 tests pass. Deployed.

  **Mechanical rule** (PreToolUse, Bash tool):
  - Extract PIDs from `taskkill`, `kill`, `pkill`, `Stop-Process` commands
  - Compare against `$PPID` (claude.exe parent) and own process tree
  - If any target PID is in own tree → BLOCK: "Cannot kill own process. PID {pid} is in your process tree."
  - Also block `close-dead-tabs.ps1` entirely (indiscriminate — has killed the active session 3 times)

  **Haiku rule** (PreToolUse, Bash tool):
  - When Claude runs any process management command (spawn, kill, cleanup, supervise), Haiku checks: "Could this command affect the current session's stability? Is it targeting the calling project?"
  - Catches indirect self-kills that regex can't detect (e.g., scripts that internally call taskkill)

  **Why both**: Mechanical catches direct `taskkill /PID {own_pid}`. Haiku catches indirect kills via scripts and cross-project resets.

### T830: Dispatched from request-tracker — Block cross-project --close-old-tab
- [x] T830: **PreToolUse mechanical gate: block `--close-old-tab` when `--project-dir` differs from CWD** — DONE. Built `close-old-tab-gate.js`. Blocks `new_session.py --close-old-tab` when `--project-dir` differs from CWD. Self-reset (same project) allowed. 20 tests. Deployed to live.

  **Rule**: `--close-old-tab` is ONLY safe when the calling tab IS the target (self-reset). When `--project-dir` points to a different project than the calling CWD, block:
  ```
  BLOCKED: --close-old-tab with cross-project --project-dir
  WHY: find_shell_pid() returns the CALLING tab's shell, not the target's.
  Using --close-old-tab here will kill YOUR tab, not the target's.
  FIX: Remove --close-old-tab. Just spawn a new tab with --project-dir.
  ```

  **Detection**: Bash command contains `new_session.py` AND `--close-old-tab` AND `--project-dir` where the project-dir path doesn't match `$CLAUDE_PROJECT_DIR`.

### T829: Dispatched from request-tracker (T93) — spec-gate TODO.md bypass
- [x] T829: **CRITICAL: spec-gate accepts TODO.md as valid spec chain, bypassing shtd** — DONE. Added shtd workflow check in two places: (1) inside `taskFoundIn === "TODO"` block (lines 544+) — catches the early return that bypassed the fallback section, (2) in the `hasTodoUnchecked` fallback section (lines 616+) — catches cases without task IDs. When shtd is enabled, TODO.md alone is NOT sufficient — requires actual spec.md → tasks.md chain. Backward compatible: non-shtd projects still use TODO.md fallback. 8 tests in test-T827-spec-gate-shtd-bypass.sh. All existing spec-gate tests pass (42+6+14). Deployed to live.

  **Fix**: When shtd workflow is enabled (check `_isShtdWorkflowEnabled()` or equivalent), the TODO.md fallback at line ~609 must NOT satisfy the spec chain. Add:
  ```javascript
  if (hasTodoUnchecked && _isShtdWorkflowEnabled()) {
    // shtd requires actual specs, not just TODOs
    return {
      decision: "block",
      reason: "BLOCKED: shtd requires specs, not just TODO entries\n" +
        "TODO.md has open items but shtd enforces spec-first development.\n" +
        "NEXT STEPS:\n" +
        "1. Create docs/<component>/specs/<task>/spec.md\n" +
        "2. Create docs/<component>/specs/<task>/tasks.md\n" +
        "3. Then implement"
    };
  }
  ```

  **This is the same T792/T794 inversion pattern**: gate goes permissive when prerequisite is missing instead of blocking.

### DESIGN DECISIONS from request-tracker manager (2026-06-02)

**T745 — Unified tracker**: YES. Request-tracker is the single tracker for all channels (Claude sessions, email, Teams). Not separate per-channel. The project already does this.

**T743 — L1 role shift**: APPROVED. L1 Haiku should gather context (TODO.md state, pending corrections, project health, recent RCAs) not just rephrase. Current copyeditor role is wasted compute.

**T750 — Watchdog default**: ENABLED by default. No opt-in. Remove the flag check or create the flag in SessionStart.

### T830: Stop rule — don't ask user systematic/technical decisions
- [x] T830: **Stop Haiku rule: Claude is the expert on systematic decisions** — DONE. Added `23-expert-decides-implementation.yaml` to `rules/stop/`. Catches technical implementation questions (PID checks, data structures, algorithms, gate placement, error handling). Redirects Claude to decide and implement. Only vision-level questions (what to build, why, priorities) should reach the user. Deployed to live + repo.
  ```yaml
  - name: expert-decides-implementation
    check: "Is Claude asking the user a technical implementation question that Claude should decide? (PID checks, data formats, algorithm choices, gate event placement, error handling strategies)"
    action: "CONTINUE — you are the expert on implementation. Decide and do it. Only surface vision-level questions (what to build, why, priorities) to the user."
  ```

### T825: PostToolUse Haiku rule — detect repetitive manual work
- [ ] T825: **PostToolUse Haiku rule: "is Claude doing something that should be automated?"** — After every tool call, Haiku asks one question: "Will Claude need to do this again next session?" If yes, emit stderr: "This should be a gate or SessionStart module so it happens automatically."

  **Not command-specific.** Haiku analyzes INTENT, not syntax. Examples it should catch:
  - Manually setting up crons → should be SessionStart
  - Manually checking process counts → should be automated health check
  - Manually reading TODO.md to decide what to work on → should be a gate that injects priorities
  - Manually spawning sessions → should be supervisor
  - Manually cleaning up stale processes → should be automated cleanup
  - Any "first thing I do every session" pattern → should be SessionStart

  **Mechanical rules** handle the obvious patterns (regex for `CronCreate`, `schtasks`, `taskkill`). Haiku handles the ambiguous ones — "Claude just read 5 files to understand project state" could be normal exploration or could be a pattern that a SessionStart context loader should handle.

  **The question is always**: "Is this a one-time action or a recurring pattern? If recurring, automate it."

### T823: Fix hook-editing-gate false positive on settings.json non-hook fields
- [x] T823: **hook-editing-gate blocks edits to `effortLevel` in settings.json** — DONE. For Edit from outside hook-runner: regex checks if old/new strings contain hook patterns (`hooks`, `PreToolUse`, `PostToolUse`, `SessionStart`, `run-modules`, `hook-runner`). Non-hook fields (effortLevel, model, env, permissions) pass through. Write (full file) still blocked — could remove hooks. 17 tests in test-T823-settings-nonhook.js. Existing 37+8 tests pass.

### T822: Dispatched from request-tracker — RCA gate
- [x] T822: **Gate: enforce RCA writing and reading** — DONE. Two modules: `rca-write-check.js` (PostToolUse) scans self-healing/lessons/ for recent entries, emits stderr reminder with RCA template. 30-min debounce, checks docs/rca/ for existing today's RCA. `rca-read-check.js` (SessionStart) surfaces RCAs from last 7 days at session start. Both non-blocking, stderr only. 27 tests.

  **Write trigger (PostToolUse, non-blocking)**: When self-healing detects anomaly (crash, OOM, tab accumulation), OR user reports failure, emit stderr: "Write an RCA to docs/rca/{date}-{incident}.md."

  **Read trigger (SessionStart, non-blocking)**: Check `docs/rca/` for RCAs from last 7 days. If any exist, emit stderr with filenames so the session reads them before starting work.

  **RCA format**: Incident, Timeline, Root Cause, Contributing Factors, Fix, Prevention. Mechanical template — no judgment needed.

### T813: Dispatched from request-tracker — Block behavioral rules in CLAUDE.md
- [x] T813: **PostToolUse: catch behavioral instructions being added to CLAUDE.md** — DONE. Built `behavioral-claude-md-check.js` (PostToolUse, non-blocking). Detects behavioral enforcement patterns (always/never/must/before every/after each/mandatory) in CLAUDE.md edits. Allows design principles (high principle-word ratio overrides). 17 tests. Deployed to live. Mechanical approach (no Haiku needed) — pattern-based detection with principle vs behavioral ratio. — When Claude edits CLAUDE.md, Haiku checks if the new content is a behavioral instruction (e.g. "reflect before acting", "review output before declaring done") vs a design principle (e.g. "portable and cross-platform"). Behavioral instructions belong as gates in hook-runner, not as ignorable text in CLAUDE.md.

  **Detection**: Edit/Write to any CLAUDE.md file. Haiku reads the diff and classifies:
  - Design principle (how to make decisions) → allow in CLAUDE.md
  - Behavioral enforcement (what to do/not do) → block, redirect to hook-runner TODO

  **Block message**: "BLOCKED: Behavioral instruction in CLAUDE.md. This will be ignored under pressure. Convert to a gate: write a TODO in hook-runner/TODO.md with the gate spec."

  **Why Haiku not mechanical**: The distinction between "design principle" and "behavioral enforcement" requires judgment. "Always cross-platform" is a principle. "Always reflect before acting" is behavioral enforcement. Regex can't distinguish them.

### T812: Dispatched from request-tracker (T51) — CRITICAL full gate audit
- [x] T812: **Audit all 172 modules against gate architecture vision** — DONE. Extended `audit-gates.js` with T812 checks: rule type classification (154 mechanical, 18 haiku), event placement (15 PostToolUse blockers found), inversion detection (2 modules), hook-log activity (120 never-fired = mostly no-log modules), workflow tag validation. Report at `docs/gate-audit/audit-results.md`. Top follow-ups: convert 15 PostToolUse blockers to warnings, add logging to 120 modules, add tests to 36 modules. For each:
  1. Rule type: mechanical or haiku?
  2. Right event? (PreToolUse blocks, PostToolUse observes, UPS classifies, Stop reviews)
  3. Blocking PostToolUse modules → move to PreToolUse or convert to warning (T803 identified 12)
  4. Inversion pattern: does it go dormant when prerequisite is missing? (T794 pattern)
  5. Working: does it appear in hook-log.jsonl? If enabled but never fires, it's broken (like spec-gate was)
  6. Workflow: correct tag? Does it belong in core/dev-discipline/self-management/gsd/fleet?

  Output: `docs/gate-audit/audit-results.md` with findings table. Vision doc at `docs/gate-architecture/vision.md` (already written) defines the model to audit against.

### T810: Dispatched from request-tracker — Fix Haiku shorthand definitions
- [x] T810: **Update `userprompt-haiku-rules.yaml` shorthand for "gate"** — Added 3 shorthand entries: `gate` (entire enforcement point, both mechanical + Haiku rules), `mechanical rule` (regex/file-lookup, fast), `haiku rule` (LLM judgment, nuanced). Opus-to-Haiku feedback loop already works via this mechanism — Opus edits the YAML, Haiku reads it fresh each prompt.

### T811: Dispatched from request-tracker — Gate architecture vision doc
- [x] T811: **Vision doc for gate architecture** — Written to `hook-runner/docs/gate-architecture/vision.md`. Covers: terminology (gate = enforcement point, mechanical rules vs haiku rules), Opus-Haiku relationship (Haiku advises, Opus decides, bidirectional feedback), when to use each rule type, event placement guide, data available to gates, workflow map, anti-patterns.

### T809: Dispatched from request-tracker — Use existing scripts, don't reinline
- [ ] T809: **PreToolUse gate: block inline commands when a project script exists** — When Claude writes a Bash command that reimplements something `manage.py` (or project scripts/) already does, block with "Use the existing script: `python manage.py <command>`."

  Detection: check if the current project has `manage.py` or `scripts/` directory. If Bash command contains patterns that match existing commands (e.g., `curl.*fleet` when `manage.py health` exists, `wmic.*process` when `manage.py cleanup` exists), block and point to the script.

  This enforces the script-not-oneoff principle retroactively — don't just build tools, USE them.

### T808: Dispatched from request-tracker — Reflection-first gate on user corrections
- [x] T808: **Two-gate handshake: force reflection before action after corrections** — DONE. Simplified to single PreToolUse gate `reflection-first-gate.js`. Reads correction-log.jsonl for recent corrections (15-min window). Sets flag file `.reflection-pending.json`. Blocks Edit/Write/Bash until TODO.md is updated with reflection keywords (root cause, lesson, pattern, prevention). Allows Read/Grep/Glob and TODO.md edits. Flag expires after 30 min. 21 tests.

  **Gate 1: Stop — `correction-flag-gate.js`**
  - When user-correction-detector detects a correction pattern, write flag to `~/.claude/hooks/.correction-pending-{session}.json`:
    ```json
    {"correction": "user said X", "ts": "...", "reflected": false}
    ```
  - Flag persists until cleared by reflection

  **Gate 2: PreToolUse — `reflection-first-gate.js`**
  - Reads `.correction-pending-{session}.json`
  - If flag exists and `reflected: false`:
    - ALLOW: Read, Grep, Glob (analysis tools)
    - ALLOW: Edit/Write to TODO.md only (writing the reflection)
    - BLOCK: all other Edit, Write, Bash
    - Block message: "Correction detected. Analyze root cause and write to TODO.md Lessons Learned before acting. Required: (1) what went wrong, (2) pattern, (3) prevention mechanism."
  - Clear condition: TODO.md Lessons Learned section has a new entry since the flag was set → set `reflected: true` → normal tools resume

  **Pattern**: Correction → Flag → Reflection → Action. Same handshake as T802 (TODO-first) but for behavioral corrections.

### T807: Dispatched from request-tracker — Self-healing output must become TODOs
- [x] T807: **Self-healing gate findings must serialize to TODO.md, not just log** — DONE. Self-healing now writes `.self-healing-findings.json` (issues, fixable count, details). Health-report-check (SessionStart) reads it and surfaces fixable issues at session start. 16 tests for self-healing-gate, 21 for health-report. Deployed.

### T806: Dispatched from request-tracker — Move hook rules out of proxy directory
- [x] T806: **Move hook rule files from `~/.claude/proxy/` to `~/.claude/hooks/rules/`** — DONE. Copied 5 rule files + 2 dirs to new locations. Updated 8 JS files with backward-compatible fallback (check new path first, fall back to old). Files moved: stop-haiku-rules.yaml, userprompt-haiku-rules.yaml, sessionstart-haiku-rules.md → `~/.claude/hooks/rules/`; stop-rules/ → `rules/stop/`; stop-checks/ → `rules/stop-checks/`; haiku-config.json → `~/.claude/hooks/`. Old files left in place for compatibility. 640/640 tests pass.

  Files to move:
  - `stop-haiku-rules.yaml` → `~/.claude/hooks/rules/stop-haiku-rules.yaml`
  - `userprompt-haiku-rules.yaml` → `~/.claude/hooks/rules/userprompt-haiku-rules.yaml`
  - `sessionstart-haiku-rules.md` → `~/.claude/hooks/rules/sessionstart-haiku-rules.md`
  - `stop-rules/` → `~/.claude/hooks/rules/stop/`
  - `stop-checks/` → `~/.claude/hooks/rules/stop-checks/`
  - `haiku-config.json` → `~/.claude/hooks/haiku-config.json`
  - `haiku-context/` → `~/.claude/hooks/haiku-context/`
  - `backups/` → `~/.claude/hooks/backups/`

  Keep in proxy: `switch_llm_provider.py` (actually proxy infra)

  Update all path references in: `auto-continue-gate.js`, `run-userpromptsubmit.js`, `haiku-client.js`, any module that reads these files. Search for `proxy` in all hook JS files.

### T805: Dispatched from request-tracker — REQUIREMENT: Always-on hook debugging
- [x] T805: **Hook debugging is always enabled, not optional** — Trace logging (traceEntry, traceModuleStart/End/Error, summary, pruneOldFiles) now ALWAYS runs — no `isActive()` check. Full input dump (writeInput) still gated behind `HOOK_DEBUG=1`/`.debug-mode` since it writes large JSON per event. 11 existing tests pass. Deployed to live.

### T804: Dispatched from request-tracker — Rule conflict visibility
- [x] T804: **Make competing rule decisions visible** — Added to `run-stop.js`: DECISION_PRIORITY map (CORRECT=5 > CONTINUE=4 > NEXT=3 > DONE=2 > DISPATCH=1), `allDecisions[]` tracker, conflict detection with `hasConflict` flag, conflict logging to hook-log.jsonl as `decision-conflict` entries, stderr output showing all verdicts and winner. Higher-priority decisions now win instead of last-one-wins. 10 new tests (31 total in T667 suite). Deployed to live.

### T801: Dispatched from request-tracker — Stop rule priority bug causes false DONE
- [x] T801: **Fix `metacognate-next` overriding `todo-awareness` with false DONE** — Renamed to `keep-working`. Rule now NEVER returns DONE. Embeds actual organize-optimize-expand instructions from legacy auto-continue text. Haiku never decides when to stop. File: `rules/stop/15-keep-working.yaml`.

  **Fix**: `todo-awareness` must be the FINAL authority. If TODO.md has unchecked actionable items, the answer is NEVER DONE regardless of what other rules think. Reorder: `todo-awareness` should run LAST and override any earlier DONE verdict. Or: `metacognate-next` must explicitly check TODO.md unchecked count before returning DONE.

  **Evidence**: This session — Haiku returned DONE after workflow reorganization TODO was filed. 14 items were pending. User caught it: "there is so much work to be done in this project i cant believe haiku thinks youre done."

### T799: Dispatched from request-tracker — archive-not-delete false positive
- [x] T799: **Fix archive-not-delete false positive on `rmdir`** — Plain `rmdir` now allowed (empty dirs only). `rmdir /s` (recursive) still blocked. 27 tests pass. Synced to live.

### T798: Dispatched from request-tracker — Haiku at every event, rules follow problems
- [x] T798: **Haiku rules at all 4 events, placed by signal detection not category** — Stop rules portion DONE (all 7 categories built). Remaining: PreToolUse and PostToolUse Haiku rule infrastructure (T786 scope).

  **Event placement guide** (for rule authors):
  - **UserPromptSubmit**: Signal is in what the user just typed. Corrections, repeated instructions, scope classification, priority override.
  - **PreToolUse**: Signal is in what Claude is ABOUT to do. Destructive commands, missing prerequisites, wrong target.
  - **PostToolUse**: Signal is in what Claude just DID. Code without specs, vision drift, gate block instructions ignored in the response.
  - **Stop**: Signal is in Claude's COMPLETE response. Overall quality, TODO state check, session health, pending corrections accumulation.

  **Current gap**: Only Stop has Haiku rules (`stop-haiku-rules.yaml`) and UPS has classification (`userprompt-haiku-rules.yaml`). PreToolUse and PostToolUse have NO Haiku rules — only mechanical gates. Need `pretooluse-haiku-rules.yaml` and `posttooluse-haiku-rules.yaml`.

  **Design principle**: Don't assign fixed responsibilities to events. Trace each real mistake from chat logs back to the moment it was first detectable, and put the rule there.

- [x] T798b: **Fix user-correction-detector cooldown** — Replaced single-prompt tracking with per-prompt fired log (`FIRED_LOG`). Each prompt fires at most once, no global cooldown. Old entries auto-cleaned after 2 hours. 61 tests pass. Synced to live.

### T791: Dispatched from request-tracker (T67)
- [x] T791: **Audit trail enforcement gates** — Built `audit-log-protect-gate.js`: blocks deletion/truncation/overwrite of .jsonl log files. Write tool blocked on JSONL. Bash append (>>) allowed, overwrite (>) blocked. 26 tests. Live. Remaining: git-commit-reminder (PostToolUse) deferred.
  1. **jsonl-protect-gate (PreToolUse)**: Block deletion of `.jsonl` log files (`dispatches.jsonl`, `tracking.jsonl`, `audit.log`, `audit.jsonl`, `health.jsonl`, `hook-log.jsonl`). Block non-append writes (overwrite/truncate). Allow appends only.
  2. **audit-log-append-gate (PreToolUse)**: On Edit/Write to any `.jsonl` file in `~/.claude/`, verify the edit is append-only (new content at end, no modifications to existing lines).
  3. **vision-doc-commit-gate (PostToolUse)**: After Edit/Write to `TODO.md` or `docs/vision/*.md`, emit stderr reminder to commit changes to git.
  Priority: Medium. These protect the immutable audit trail documented in `docs/vision/audit-trail.md`.

### Session 2026-06-02b — Bug fixes filed during work
- [x] T813: **Fix no-rewrite-gate false positive on `mv` (rename)** — Root cause: `extractBashTarget()` didn't handle `mv` destinations, so the target-exists check was skipped and all `mv` of code files was blocked. Fix: added `mv` target extraction to `extractBashTarget()`. Now `mv` to non-existent file (rename) passes; `mv` to existing file (overwrite) blocks. Deployed to live.

### Session 2026-06-02c — Bugs found during deployment
- [x] T822: **Fix hook-editing-gate + gate-quality-gate false positives** — Three fixes: (1) hook-editing-gate: `weakening` object string-concatenated producing `[object Object]` — extracts `.reason`. (2) hook-editing-gate: `nameSuggestsGate` matched "block" in comments like `// never block` — strips comments before checking. (3) gate-quality-gate: `cp` from hook-runner project blocked — extended `mv` exemption to include `cp`. 8+37+20 tests pass. All deployed to live.

- [x] T823: **gate-quality-gate false positive: `> /dev/null` triggers redirect write pattern** — Added negative lookahead `(?!\/dev\/null\b)` to redirect pattern. `diff file > /dev/null` now passes, real redirects to hook files still blocked. 4/4 tests + 20/20 existing pass. Deployed to live.

## Dispatched from request-tracker (2026-06-04) — Haiku Stop Hook Fixes

RCA: `request-tracker/docs/rca/2026-06-04-session-review.md`

- [x] T834: **Filter dispatched items from readTodo()** — Added `DISPATCHED_RE` regex to `readTodo()` that filters out lines containing "dispatched", "Dispatched as T", "BLOCKED:...project not cloned", "cross-project", "assigned to", "owned by". 31 tests in `test-auto-continue-gate.js` + `test-T834-dispatched-filter.js`. Deployed.
- [x] T835: **Add stagnation-detector stop rule** — Created `rules/stop/31-stagnation-detector.yaml`. Detects status-checking responses ("Stable", "Monitoring", "No changes") with no substantive work. Also fixed directory name mismatch: auto-continue-gate now checks `stop/` directory first (was only looking for `stop-rules/`). 38 tests pass. Deployed.
- [x] T836: **Add project role context to Haiku prompt** — Added `readProjectRole()` that reads `## ROLE:` or `ROLE:` from TODO.md header. Injected into Haiku prompt with "only suggest actions appropriate for this role". Tested in T834 suite.
- [x] T837: **Extend mandate dedup with rejection tracking** — Added `getRecentRejections()` with 30-minute memory. When Claude's response contains "dispatched"/"not actionable"/"cross-project", logs rejection to mandate-log.jsonl. Haiku prompt includes REJECTED SUGGESTIONS section. `hasRecentMandate()` skips rejection entries. Tested in T834 suite.
- [x] T838: **Fix TODO-first gate** — Root cause: gate tagged `// WORKFLOW: starter` but only `haiku-rules` workflow is enabled. Added `haiku-rules` to workflow tag. Also confirmed UPS runner correctly writes `.pending-requests-{session}.json` via Haiku triage. 28 tests pass. Deployed.

### Session 2026-06-04a — Test Coverage Expansion

- [x] T839: **Tests for 4 untested modules** — Created test suites for stop-fired-check-gate (10 tests), sibling-session-detect-gate (19 tests), worktree-scope-guard-gate (15 tests), transcript-shared-reader-gate (22 tests). Untested module count: 14 → 10. Total: 66 new tests.

## Dispatched from request-tracker (2026-06-18) — Dispatcher Pattern Enforcement

**Context:** Request-tracker is a manager/dispatcher session. It should NEVER do implementation work directly — it creates requests, dispatches to worker tabs, follows up, and reports back. Each project tab has its own CLAUDE.md, rules, and context that the dispatcher lacks. Past sessions violated this: SSH'd to lab hosts, edited files in other projects, wrote code in token-tracker. These gates enforce the pattern mechanically.

**RCA references:** `request-tracker/docs/rca/2026-06-04-session-review.md` (Problems 2, 5), `request-tracker/docs/rca/2026-06-02-supervisor-killed-wrong-tab.md` (cross-project action killed own session)

### T840: PreToolUse gate — Block remote execution from dispatcher session
- [x] T840: **block-remote-execution-gate.js** — DONE. Mechanical PreToolUse gate. Blocks ssh/scp/rsync from request-tracker sessions. Safe patterns (curl localhost, git, manage.py) pass through. 35 tests.

  **Mechanical rules:**
  - Regex: `\bssh\b.*@(?!127\.0\.0\.1|localhost)` → BLOCK
  - Regex: `\bscp\b.*@` → BLOCK
  - Regex: `\brsync\b.*@` → BLOCK
  - Allow: `curl.*127\.0\.0\.1`, `curl.*localhost` (API management calls)
  - Allow: `ssh.*127\.0\.0\.1` (local tunnel, unlikely but safe)

  **Block message:** "BLOCKED: Remote execution from dispatcher session. Request-tracker is a manager — it dispatches work, not executes it. Dispatch this to the target project's session instead: write a TODO in {target-project}/TODO.md and spawn a session."

  **Tests:** Block `ssh root@10.0.0.92`, block `scp file root@host:/path`, allow `curl http://127.0.0.1:4101/api/requests`, allow `python manage.py status`.

### T841: PreToolUse gate — Block file edits outside dispatcher project
- [x] T841: **dispatcher-scope-gate.js** — DONE. Mechanical PreToolUse gate. Blocks cross-project Edit/Write from dispatcher. Allows TODO.md, .coconut/, .claude/plans/, SESSION_STATE.md. 26 tests.

  **Exceptions (allowed cross-project writes):**
  - `TODO.md` in any project (dispatching work)
  - `.coconut/` paths (status reporting)
  - `.claude/plans/` (plan mode files)

  **Mechanical rules:**
  - Check tool: Edit or Write
  - Check file_path: does NOT contain `request-tracker`
  - Check file_path against exception list
  - If not in exception list → BLOCK

  **Block message:** "BLOCKED: Cross-project file edit from dispatcher. Request-tracker manages work, it doesn't edit other projects' code. Write a TODO in {target-project}/TODO.md instead, then spawn a session there."

  **Tests:** Block `Edit llm-token-tracker/dashboard/index.html`, block `Write imsva-upgrade/CHECKLIST.md`, allow `Edit request-tracker/server.py`, allow `Write hook-runner/TODO.md` (dispatch), allow `Write .coconut/STATUS_REPORT.md`.

### T842: PreToolUse Haiku gate — "Is this dispatch or direct work?"
- [x] T842: **dispatch-or-work-gate.js** — DONE. Haiku PreToolUse gate. Second-line defense after T840/T841 mechanical gates. Safe commands (manage.py, curl localhost, git) skip Haiku. Ambiguous commands go to L1 for judgment. Fallback=allow when proxy down. 23 tests.

  **Haiku decision:** `{allow: bool, reason: string}`
  - If `allow: false` → BLOCK with reason + suggest dispatch approach

  **Fires only on:** state-changing tools (Bash, Edit, Write). Skips read-only tools (Read, Glob, Grep).

  **Cost control:** Only fire when mechanical gates (T840, T841) pass — Haiku is the second line for ambiguous cases.

### T843: SessionStart module — Auto-create CronCreate for dispatch cycle
- [x] T843: **dispatcher-cron-check.js** — DONE. SessionStart module. Emits CronCreate instructions for dispatch heartbeat (*/3) and supervise (*/5) cycles. Anti-stagnation: warns against "Stable. Monitoring." responses. 15 tests.

  **Cron prompt (every 3 min):**
  1. `python manage.py heartbeat-check --json` — fast pre-check
  2. If status != "clean": run `python manage.py poll` + `python manage.py email-poll`
  3. Check tab count via fleet API — if >4, log warning
  4. If any dispatches completed, update request status

  **Key improvements over Jun 4 version:**
  - Heartbeat-check gates the expensive operations (don't poll if nothing changed)
  - Tab count monitoring built into the cycle
  - No "Stable. Monitoring." responses — skip if heartbeat is clean

  **Supersedes:** T824 (same concept, this is the refined spec)

### T844: PreToolUse gate — Block self-kill from dispatcher
- [x] T844: **dispatcher-self-kill-gate.js** — DONE. Mechanical PreToolUse gate. Blocks manage.py cleanup --kill, new_session.py --close-old-tab, close-dead-tabs, manage.py supervise --kill from dispatcher. 25 tests.

  **Mechanical rules:**
  - Block: `taskkill` where target PID matches own PID tree (read from env or `/proc/self`)
  - Block: `kill` commands targeting own PID tree
  - Block: `manage.py cleanup --kill` (manager should never kill its own processes)
  - Block: `new_session.py --close-old-tab` from request-tracker (self-reset should be external)

  **Block message:** "BLOCKED: Self-kill attempt from dispatcher session. Request-tracker cannot terminate its own process tree. Use an external trigger (user, another session, or OS scheduler) to reset this session."

  **RCA:** 4 self-kill incidents on 2026-06-02/03. T831 partially covers this but T844 adds dispatcher-specific patterns.

### T845: Stop rule — Verify dispatcher didn't do direct work
- [x] T845: **dispatcher-review stop rule** — DONE. Stop Haiku rule `32-dispatcher-review.yaml`. Catches direct implementation work from dispatcher sessions. Deployed to live.

  **Rule file:** `rules/stop/32-dispatcher-review.yaml`

### T846: Stop rule — Verify tabs are clean before stopping
- [x] T846: **clean-workspace stop rule** — DONE. Stop Haiku rule `33-clean-workspace.yaml`. Catches orphaned terminal tabs from killed processes. CONTINUE if violations found. Deployed to live.

  **Mechanical check:** Count terminal windows vs active Claude processes. If processes < terminals, there are orphan tabs.
  **Haiku check:** "Did this session terminate any Claude process? If so, was the terminal window also closed?"

  **RCA:** User complaint — "you would just stop the claude process without closing the windows terminal tab, which is not acceptable"

### T847: Dispatched from request-tracker — Stop hook watchdog self-correction
- [ ] T847: **Watchdog auto-creates fix task when primary stop hook misfires** — The existing watchdog stop hook (T828) validates primary stop hook decisions. New rule: when the watchdog detects the primary stop hook made an incorrect decision (e.g., said CONTINUE when session should stop, or said DONE when work remains), automatically create a TODO in hook-runner to fix the specific rule that misfired.

  **Detection:** Watchdog already evaluates primary decision. Add: if watchdog disagrees with primary, append to `~/.claude/hooks/stop-hook-misfire-log.jsonl` with: which rule misfired, what it said, what watchdog thinks is correct, and the context. Then emit stderr: "Stop hook misfire logged. Fix task should be created in hook-runner."

  **Watchdog meta-rules (start with rule 1):**
  1. If primary stop hook result is wrong, create a task to fix it

  **Key constraint:** Watchdog must NEVER block — it's an observer that creates fix-tasks. The primary stop hook remains the authority for the current session.

### T848: Fix portal-verify-gate false positive on TODO.md appends
- [x] T848: **portal-verify-gate false positive fix** — DONE. For Edit operations, checks if the checked pattern pre-existed in old_string (append case). 3 new tests in test-T662-portal-verify.sh (31 total). Deployed to live.

### T849: Fix todo-first-gate false positive on cron heartbeat checks
- [ ] T849: **todo-first-gate blocks cron-triggered health checks** — Gate fires on automated cron heartbeat prompts (heartbeat-check, tab inventory, stale task checks) and demands TODO.md entries before executing. These are recurring automated diagnostics, not user requests — they don't need TODO tracking. Fix: detect cron-triggered prompts (look for patterns like "Run silently", "report only problems", "heartbeat cycle", "health check") and skip the TODO-first requirement for them.

### T850: Dispatched from request-tracker — Enforce token tracking via X-Project header
- [ ] T850: **SessionStart module: inject X-Project header for Claude Code sessions** — Claude Code routes through proxy at :4100 but sends no `X-Project` header, so all calls show as `(cli)` in the dashboard. The proxy already reads `X-Project` (proxy.js line 622). Fix: SessionStart module that checks if `ANTHROPIC_CUSTOM_HEADERS` env var includes `X-Project`. If not, emit instructions to set it based on `process.cwd()` project name. Alternatively, the proxy could extract project from `caller_cwd` if Claude Code sends it — check if there's a way to get CWD from the request.

  **Also needed:** Gate that blocks sessions where tokens aren't being tracked (no X-Project header → dashboard shows `(cli)` → no cost visibility per project). PreToolUse warning on first Bash/Edit call if token attribution is missing.

### T851: Dispatched from request-tracker — Stop hook dispatch enforcement gate
- [ ] T851: **Haiku gate: if stop hook tells you to work in another project, dispatch instead** — When stop hook says CONTINUE with actions involving another project (e.g., "verify T831 in hook-runner", "check imsva-upgrade status"), the dispatcher should create a TODO in that project and spawn a session — NOT do the work directly. Currently, the dispatcher sometimes follows stop hook suggestions and does cross-project work itself.

  **Implementation:** PostToolUse Haiku rule after Stop hook fires. Reads stop hook output. If stop hook suggested actions in another project, check: did the dispatcher create a TODO in that project? If not, emit stderr: "Stop hook suggested work in {project}. Dispatch it: write TODO in {project}/TODO.md and spawn a session. Don't do it yourself."

  **Key insight:** Stop hook rules like `todo-awareness` don't understand the dispatcher pattern — they see unchecked TODOs and say "do them" without knowing this session can't/shouldn't. This gate intercepts that and redirects to dispatch.

### T852: Fix dispatcher-self-kill-gate block message — too broad, prevents safe context resets
- [ ] T852: **dispatcher-self-kill-gate.js block message says "ask the user to trigger it externally"** — This message caused Claude to stop doing context resets entirely, even though `new_session.py` WITHOUT `--close-old-tab` is perfectly safe (spawns new tab, old stays alive). The gate logic is correct (only blocks `--close-old-tab`), but the block message scared Claude into thinking ALL context resets require external triggers.

  **Fix:** Change the block message (lines 57-60) from "Use an external trigger" to: "Remove --close-old-tab and re-run. Spawning a new tab without closing yours is safe: `python new_session.py --project-dir <project>`"

  **Root cause:** Previous sessions ran context resets fine. After T844 deployed, Claude read the block message once, internalized "can't do context resets from dispatcher", and started telling the user to do it manually — violating the "never ask the user to do anything manually" rule.
