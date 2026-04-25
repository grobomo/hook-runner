# Hook-Runner Enforcement Manifest

Auto-generated: 2026-04-25
Run `node generate-manifest.js` to regenerate.

## Summary

| Category | Count | Description |
|----------|-------|-------------|
| Active gates | 7 | Blocked 10+ times — proven enforcement |
| Low-activity gates | 6 | Blocked 1-10 times — edge cases |
| Preventive gates | 30 | Loaded 100+ times, never blocked — deterrent |
| Unused/untested gates | 29 | Candidates for removal |
| Monitors/setup/cleanup | 46 | Non-blocking, observational |
| **Total** | **118** | |

## Active Gates

These rules block regularly. They are the core enforcement layer.

### gsd-plan-gate
**Why:** Claude dived into coding without a GSD plan, producing untracked work that couldn't be reviewed via PRs or traced to any roadmap phase. This gate enforces the GSD pipeline: .planning/ROADMAP.md must exist with at least one phase, and code edits require either an active phase with a PLAN.md or unchecked tasks in TODO.md.
**Blocks:** 49 / 577 invocations
**Last block:** 2026-04-25T01:28:25.208Z

### git-destructive-guard
**Why:** Claude ran `git reset --hard` and `git checkout .` to "clean up" working trees, destroying uncommitted work. These ops are rarely the right solution — investigate root cause instead. Only rebase was gated (git-rebase-safety); other destructive ops were unguarded.
**Blocks:** 28 / 436 invocations
**Last block:** 2026-04-25T01:28:19.472Z

### archive-not-delete
**Why:** Claude deleted files that turned out to be needed later. Block destructive delete commands. Always archive, never delete. Returns null to pass, {decision:"block", reason:"..."} to block.
**Blocks:** 15 / 438 invocations
**Last block:** 2026-04-25T01:28:19.823Z

### force-push-gate
**Why:** Force-pushing to main/master can destroy shared history and others' work. There is no undo for a force-push that overwrites remote commits.
**Blocks:** 13 / 426 invocations
**Last block:** 2026-04-25T01:28:20.201Z

### no-rules-gate
**Why:** User has instructed at least 3 times across sessions to never use ~/.claude/rules/ or .claude/rules/ — only hook-runner modules and workflows. Rules are invisible, unenforceable, and duplicate what hooks already do. This gate ensures the instruction sticks permanently.
**Blocks:** 13 / 82 invocations
**Last block:** 2026-04-25T01:28:20.572Z

### branch-pr-gate
**Why:** Claude committed directly to main, bypassing review.
**Blocks:** 12 / 505 invocations
**Last block:** 2026-04-25T01:28:20.829Z

### commit-counter-gate
**Why:** Claude makes 20+ file changes without committing, then context resets and all work is lost or untraceable. User tracks progress via GitHub Mobile. Every 15 edits, force a commit so there's a git trail. T459: Raised from 5→15. 5 interrupted mid-feature (config+code+test+docs = 5 files). 15 gives room for a coherent change while still catching runaway sessions. T466: Added branch-file mismatch detection + worktree enforcement. Incident: Claude committed dd-lab files to branch 001-T001-deploy-nfs-datasec-v2 because the gate just said "commit now" without checking branch fitness. Now: detects mismatch → tells Claude to use EnterWorktree instead of committing to the wrong branch. Also enforces worktrees over bare branch checkouts.
**Blocks:** 12 / 488 invocations
**Last block:** 2026-04-24T23:21:25.848Z

## Low-Activity Gates

- **enforcement-gate** — Code edits in repos without TODO.md or with dirty trees caused lost work. Enforcement gate: git repo, clean tree, TODO.md required before Edit/Write (4 blocks)
- **gh-auto-gate** — `gh auth switch` is broken with EMU accounts — the API still uses the EMU token even after switching. Raw `gh` and `git push` commands silently use the wrong account, causing 403s or pushing to the wrong org. gh_auto reads .github/publish.json and sets GH_TOKEN correctly every time. Tagged security (never disable) instead of shtd. (3 blocks)
- **gsd-gate** — Renamed to test-checkpoint-gate (T504). Alias kept for modules.yaml backwards compat. (1 blocks)
- **hook-system-reminder** — Claude repeatedly tries to create .claude/rules/ files despite being told dozens of times across dozens of sessions. This hook fires when Claude tries to WRITE or EDIT anything in ~/.claude/ to remind it how the system works. It's a soft block — Claude can proceed after reading the reminder. (3 blocks)
- **spec-gate** — Claude implemented features that nobody asked for, wasting hours. T321: Strengthened — if branch has TXXX, that specific task must be unchecked. T322: Cross-project guidance in block messages. T323: "Spec before code" explicit reminder in all block messages. T374: Task ID match takes priority over fuzzy word matching — prevents false positives. T384: Allowlist session management scripts (new_session.py, context_reset.py) and curl. (4 blocks)
- **task-completion-gate** — A claude -p session marked T020-T024 as [x] complete in TODO.md without creating PRs, deploying, or verifying. The "fixes" were never tested. This happened because nothing enforced the link between task completion and evidence. // ENFORCES (globally, all projects): - Cannot mark a task [x] without a PR reference "(PR #N)" on the same line - Each task gets its own PR (enforced by pr-per-task-gate.js) - Spec gate (spec-gate.js) ensures specs exist before code edits - This gate closes the loop: completion requires verified evidence // WORKFLOW: 1. speckit.specify → spec.md 2. speckit.plan → plan.md 3. speckit.tasks → tasks.md with T001, T002, etc. 4. Feature branch: git checkout -b <NNN>-<feature> 5. Each task: implement → PR (with task ID in title) → verify → mark [x] with PR # 6. Feature branch merges to main after ALL task PRs verified + E2E passes (2 blocks)

## Preventive Gates

Run on every tool call but never blocked. Either working as deterrents or unnecessary.

- **aws-tagging-gate** — AWS resources created without tags were impossible to attribute or clean up. Enforce hackathon26 tags on AWS resource creation commands. Checks: aws cloudformation, aws ec2 run-instances, aws s3api create-bucket, aws lambda create-function, and similar resource-creating commands. Returns null to pass, {decision:"block", reason:"..."} to block.
- **blueprint-no-sleep** — Claude kept adding `sleep` between Blueprint MCP calls thinking pages needed time to load. Each Claude prompt takes 3-10s to process — more than enough for pages to load. Sleep wastes time twice: once for the sleep, once for Claude processing the sleep result.
- **claude-p-pattern** — Claude tried 3 wrong ways to call claude -p (--no-input, pipe via echo, timeout with arg) and then tried to use ANTHROPIC_API_KEY / SDK instead of just using claude -p correctly. The correct pattern is simple: 1. Write prompt to temp file 2. Pipe via stdin: claude -p --dangerously-skip-permissions < promptfile 3. No API key needed — same auth as running Claude Code session 4. For images/PDFs: include absolute file paths in prompt, tell Claude to use its Read tool to view them. NEVER base64-inline images. 5. See analyze-next.sh in recording-analyzer for a working example.
- **commit-quality-gate** — Generic commit messages like "fix" or "update" make git history useless. When debugging E2E failures across 10+ deploy cycles, you need to know what each commit actually changed and why. Bad messages waste 10+ minutes per cycle.
- **crlf-ssh-key-check** — Windows scp/cp adds \r\n to SSH keys. OpenSSH rejects them with "error in libcrypto". This happened repeatedly with fleet key deployment.
- **cwd-drift-detector** — When working in project A, Claude drifts into project B's files (cd, edit, read). Instead of working in-place, spawn a new tab via context-reset so both projects get proper tracking, hooks, and TODO.md context.
- **deploy-gate** — E2E deploy cycles take 10+ minutes. When deployed from a dirty tree, results can't be traced to a specific commit SHA. Wasted debugging time when you can't reproduce what was actually deployed.
- **deploy-history-reminder** — Claude repeats failed deploy approaches because it doesn't check git history first. Each E2E cycle is 10+ minutes. Checking recent commits takes 2 seconds and prevents wasting 30+ minutes on already-tried approaches.
- **disk-space-guard** — Claude ran rm -rf on temp files when disk was full without asking. Deleting files to free space is dangerous — wrong target = lost work. This gate blocks destructive commands when the previous error was disk-related.
- **e2e-self-report-gate** — Renamed to test-checkpoint-gate (T504). Alias kept for modules.yaml backwards compat.
- **env-var-check** — Missing env vars caused silent failures deep in workflows.
- **git-rebase-safety** — During a rebase, --ours/--theirs are REVERSED from intuition. Claude used --theirs thinking it meant "my local changes" but during rebase it means the upstream branch. This silently dropped 30+ hook modules. Also: credential helper must use double quotes not single.
- **gsd-branch-gate** — Branches created during GSD work had no connection to roadmap phases, making it impossible to trace which branch implemented which phase. This gate enforces branch naming that maps to active GSD phases.
- **gsd-pr-gate** — PRs were created without referencing a GSD phase, making it impossible to trace which PR implemented which phase of the roadmap. One PR per phase ensures clean audit trail and mobile monitoring via GitHub notifications.
- **inter-project-priority-gate** — Inter-project TODO items (XREF tags) represent live bugs from real-world usage in other projects. Without enforcement, Claude works on normal backlog while critical feedback sits unresolved. This gate blocks non-XREF work when XREF items are pending — forces P0 items to be addressed first. T486: Inter-project TODO priority system.
- **messaging-safety-gate** — Claude autonomously sent messages to real people during testing. This gate blocks all outbound messaging (email, Teams, meetings) unless the target is explicitly authorized. Prevents accidental spam to colleagues.
- **no-adhoc-commands** — Ad-hoc AWS/SSH/Azure commands died with the session. Scripts survive. Block ad-hoc Bash commands for AWS, Azure, SSH, Docker, and infrastructure. ALL operations must go through reusable scripts in scripts/. If a script doesn't exist, you must CREATE IT first, then use it. This applies to both local Claude and CCC workers.
- **no-focus-steal** — Background claude -p self-analysis opened a visible terminal tab that stole focus from the user's work. On Windows, child_process.spawn with detached+windowsHide still flashes a console. // SCOPE: Only blocks background PROCESS launches (nohup, &, detached scripts). Does NOT block opening files (start "" "file.pdf") — that's user-requested and SHOULD take focus. Cross-platform: only fires on win32 since macOS/Linux don't have the console-flash problem.
- **no-hook-bypass** — Claude circumvented a PreToolUse gate by using Bash (cat >, echo >) instead of the blocked Write/Edit tool. This defeats the entire hook enforcement system. If a gate blocks Write/Edit, Bash must not be used as a backdoor to write the same file. // Detection: When a Bash command writes to a file (cat >, echo >, tee, printf >), check if any PreToolUse gate would have blocked the equivalent Write/Edit. Also detects Claude explicitly saying "bypass" or "work around" a hook in its reasoning.
- **no-nested-claude** — Nested `claude -p` calls inside a session don't work reliably. Cross-project work must use context_reset.py which opens a proper new terminal session. Also blocks TaskCreate since it's a within-session tracker, not a session spawner.
- **openclaw-tmemu-guard** — _tmemu/openclaw is the live production OpenClaw instance. Hook porting work must happen on a separate _grobomo/openclaw test instance in WSL. This gate blocks any edits to hook-related files in _tmemu/openclaw to prevent accidental modification of the production hook system.
- **pr-first-gate** — Claude created specs and wrote code on branches without opening a PR first. The dev team monitors progress via GitHub Mobile notifications — without a PR, nobody knows work is happening. The correct flow is: 1) receive task  2) create PR  3) spec  4) failing tests  5) implement  6) e2e  7) merge This gate blocks spec/code edits on feature branches that don't have an open PR.
- **pr-per-task-gate** — Batched PRs with multiple tasks made mobile monitoring and rollbacks impossible.
- **publish-json-guard** — ep-incident-response (private customer data) was published to grobomo (public). Root cause: nothing prevented Claude from editing publish.json or git remotes, which control which GitHub account receives pushes. This gate blocks modifications to publish.json, git remote config, and git remote commands. Creating a NEW publish.json (Write when file doesn't exist) is allowed — CLAUDE.md requires every git project to have one.
- **root-cause-gate** — Claude masked bugs with cleanup instead of fixing root causes. Root cause gate: block retry/cleanup patterns without diagnosis Detects when Claude is about to re-run a command that just failed, or clean up a mess without fixing why it happened.
- **secret-scan-gate** — API keys were committed to git history and had to be rotated. T530: Added --name-only fast path — skips expensive full diff when all staged files are safe extensions (.md, .yml, .txt, etc.). Reduces 200-1416ms spikes to <5ms on metadata-only commits (TODO.md, CHANGELOG.md, etc.).
- **spec-before-code-gate** — Claude dives into coding without documenting what it's fixing or why. After context resets, there's no trail of intent. Forces a spec (TODO entry or recent commit message) before the first file modification.
- **unresolved-issues-gate** — Claude commits code while TODO.md or report data still has unresolved FAIL, timeout, MISMATCH, or WARN entries. Bugs ship because the commit focused on what worked and skipped what didn't. Scanning TODO.md before commit catches overlooked issues.
- **victory-declaration-gate** — Claude declares victory prematurely — "all tests pass", "complete", "all green" in commit messages when failures were skipped, warnings ignored, or outputs not reviewed. This cost hours in E2E cycles where bugs shipped because the commit message said "done".
- **workflow-compliance-gate** — A Claude session on ddei project ran ad-hoc commands for 45 minutes without SHTD active. When asked, it admitted "no, I just jumped straight into ad hoc commands." Globally enforced workflows must be active in EVERY project. No exceptions by default. T530: Replaced require(workflow.js) + require(hook-log.js) with direct JSON reads. Old approach loaded two heavy modules (~10ms each) on every tool call (936 calls/session). Now: reads workflow-config.json directly + file-based cache with mtime key. Only loads hook-log.js on block/exception (rare), not the common pass path. Saves ~14ms/call.

## Unused/Untested Gates — Candidates for Removal

- **block-local-docker** (unused) — Local docker builds consumed disk/CPU and caused "no space left on device" failures. All container workloads should run on remote infrastructure (EC2, ECS, cloud-claude). (0 invocations)
- **continuous-claude-gate** (untested) — Claude implemented features without any task tracking, making progress invisible. Tracked workflow gate: blocks implementation code unless the project has a tracked task workflow (specs/tasks.md with T### checkboxes). // WHY THIS EXISTS: Every code change must map to a tracked task so the dev team can see progress via GitHub PRs. Untracked work is invisible — nobody can review, monitor, or understand what happened. The task trail IS the project history. // BOOTSTRAP: New projects need to create specs/tasks.md before implementation. This gate allows all scaffolding files (TODO.md, specs/, .github/, etc.) so you can set up the project structure first. Once you have specs with tasks, implementation code is unblocked. // Returns null to pass, {decision:"block", reason:"..."} to block. (77 invocations)
- **cross-project-todo-gate** (untested) — Prevents cross-project TODO items from being written into the current project's TODO.md. These items belong in the referenced project's TODO.md where they'll actually get picked up and executed. The cwd-drift-detector already allows writing TODO.md to other projects — this gate ensures Claude uses that path instead of dumping everything locally. (77 invocations)
- **hook-editing-gate** (untested) — A rogue Claude tab silently weakened spec-gate.js by removing Bash from the gated tools list. No audit trail, no alert. Any session could modify hooks to bypass its own enforcement. This gate now locks hook editing to the hook-runner project only, with static weakening detection for all changes. T339: Project-locked + weakening detection + self-edit protection. (72 invocations)
- **instruction-to-hook-gate** (untested) — User instructions ("always X") were forgotten next session. Must become hooks or SHTD workflows. (67 invocations)
- **no-fragile-heuristics** (untested) — Claude wrote pixel-ratio thresholds and color-counting heuristics to detect blank screenshots and login pages. These broke on F5 (dark login page) and would false-positive on white dashboards. The user corrected: "don't make a fragile verification script — make claude do it." // RULE: When a check requires visual/subjective judgment (screenshot quality, report appearance, UI state), use claude -p or the Anthropic SDK. Never write threshold-based heuristics (pixel ratios, color counts, regex sentiment). // SCOPE: Blocks Edit/Write when the new content contains telltale patterns of visual heuristics being written into verification/review/check scripts. (67 invocations)
- **no-hardcoded-paths** (untested) — Hardcoded C:SERS PATHS IN SCRIPTS BROKE PORTABILITY ACROSS MACHINES. BLOCK WRITE/Edit with hardcoded absolute user paths in file content. Catches Windows, Linux, and macOS home directory paths in new_string/content. Absolute paths break portability — use variables or relative paths. (69 invocations)
- **no-passive-rules** (untested) — Claude kept creating .md rule files in .claude/rules/ instead of active hook modules. Rule files are passive — Claude has to read and choose to follow them. Hook modules are active — they execute and block. Persistent lessons and enforcement belong in hooks, not rules. // SCOPE: Blocks Write/Edit to .claude/rules/ (global or project) when creating NEW .md files. Editing existing rules is allowed (maintaining, not creating). (2 invocations)
- **preserve-iterated-content** (untested) — Claude rewrote a stop hook module, condensing a user-authored message that had been refined over 15 iterations. The message text was treated as "my code" instead of a carefully evolved artifact. This gate catches full-file rewrites (Write tool) on files with significant git history and suggests using Edit instead. T478: Added file-based cache — git rev-list was 882ms avg on Windows. T496: Switched cache key from headSha:path to path-only with 5min TTL. headSha-based keys invalidated on every commit, causing constant cache misses (663ms avg, 1556ms spikes). Commit counts change rarely — TTL is sufficient. T539: Three perf fixes — 30min TTL (was 5min), skip saveCache on hits, fs.existsSync fast path for new files. Avg 291ms → <5ms on cache hits. (2 invocations)
- **reflection-gate** (untested) — Self-reflection module (Stop event) flags workflow violations via LLM analysis, but those flags are useless if Claude keeps editing without seeing them. This gate checks the reflection log for unresolved high-severity issues and blocks production code edits until they're addressed. (69 invocations)
- **remote-tracking-gate** (untested) — Commits on untracked branches were invisible on mobile. (69 invocations)
- **settings-change-gate** (untested) — Config changes happened without stated rationale, causing confusion later. Settings change gate: injects a reminder when modifying ~/.claude/ config files. Doesn't block — just ensures Claude states the reason in its response. (69 invocations)
- **settings-hooks-gate** (untested) — Claude added hooks directly to settings.json instead of using the hook-runner module system (run-modules/{Event}/*.js). Direct settings.json hook entries bypass the modular architecture and create one-off hooks that can't be independently managed, archived, or reasoned about. // The hook-runner pattern: ONE runner per event in settings.json, modules in run-modules/{Event}/. To add behavior, create a module — never edit the hooks section of settings.json. // Incident: 2026-04-04 — Claude added chat-export and terminal-title hooks directly to settings.json Stop and SessionStart arrays instead of creating run-modules/Stop/ and run-modules/SessionStart/ modules. (67 invocations)
- **test-checkpoint-gate** (untested) — PRs merged from mobile had no tests, breaking production. (63 invocations)
- **why-reminder** (untested) — Comments that describe WHAT code does are useless — Claude can read code. Comments that explain WHY decisions were made are invaluable — they survive context resets, guide fleet workers, and prevent future sessions from repeating mistakes. This non-blocking reminder fires before every Write/Edit to code/config/docs, nudging Claude to include WHY reasoning in comments, docs, and commit messages. (63 invocations)
- **windowless-spawn-gate** (untested) — Hook modules using execSync("git ...") spawn cmd.exe on Windows, creating visible console popups that steal focus. Every tool call fires 2-5 hooks, each potentially spawning multiple cmd.exe windows. Fix: require execFileSync (no shell) or windowsHide:true on all child_process calls in hook module code. This gate blocks writes of modules that violate. (63 invocations)
- **worker-loop** (unused) — Workers in the CCC fleet would create PRs before tests passed, then merge from mobile without verifying. This gate blocks PR creation until the task's e2e test exits 0. (0 invocations)
- **workflow-gate** (untested) — Steps in a workflow were skipped — build ran before setup, deploy before test. Workflow gate: enforces step order in active workflows. If a workflow is active, the current step's gate must be satisfied before code edits. Allowed paths (TODO.md, specs/, tests/, etc.) bypass the gate. (63 invocations)
- **worktree-gate** (untested) — Multiple Claude tabs on the same repo directory cause git conflicts — stash collisions, dirty working trees, index.lock contention, branch switches stomping each other's changes. Git worktrees give each tab its own directory. This gate enforces worktree usage: edits in the main checkout are blocked, forcing Claude to use EnterWorktree for an isolated working directory. (63 invocations)
- **ddei-email-security/customer-workflow-only** (unused) — Every bash command must use a reusable script the customer could run. Ad-hoc az/terraform/azcopy commands bypass deploy.ps1, break reproducibility, and duplicate effort across sessions. If the customer won't run it, document WHY in a script comment (they probably will need it eventually). // Allowed: - share/scripts/*.sh, share/lib/*.py (customer scripts) - e2e-deploy.sh, e2e-multi.sh, e2e-launch.sh, e2e-poll.sh (test harness) - scripts/*.sh (internal tooling scripts) - share_deliverable.sh, open-rdp.sh (project tooling) - Basic dev: git, bash -n, python (syntax), ls, cat, grep, diff, etc. // Blocked: - Raw az, terraform, azcopy, powershell.exe with infra args - Any infra command not wrapped in a script (0 invocations)
- **ddei-email-security/e2e-no-block** (unused) — Claude wasted 60+ min per E2E run polling TaskOutput in a loop, unable to do other work. The E2E pipeline runs autonomously — launch via scripts/e2e-run.sh (fire-and-forget), check results via summary file. // BLOCKS: - Running e2e-deploy.sh directly (use scripts/e2e-run.sh wrapper) - TaskOutput with block=true + timeout>60s on E2E tasks (sitting idle) // ALLOWS: - scripts/e2e-run.sh (correct entry point) - scripts/check-e2e-status.sh (quick status check) - TaskOutput with block=false (non-blocking peek) - cat test-results/*/e2e-summary.txt (instant result check) (0 invocations)
- **ddei-email-security/rdp-testbox-gate** (unused) — Claude wasted an entire session reinventing RDP connection logic that already worked in start-e2e-test.sh (commit 21e5b3d). This hook fires on any RDP-related command to remind Claude of: 1. The PROVEN RDP pattern (powershell + cmdkey /generic: + AuthenticationLevelOverride) 2. joel-scripts/testbox-* is the USER'S personal testbox — hands off 3. Claude creates its OWN test server for E2E runs (ddei-tester, not ddei-testbox) (0 invocations)
- **ddei-email-security/share-is-generic** (unused) — share/ is the customer deliverable shipped to many different customers. Customer names, internal project codenames, meeting note references, and employee names leaked into share/ files multiple times during development. This gate blocks Write/Edit to any file under share/ when the content contains customer-specific or internal-only references. (0 invocations)
- **ep-incident-response/no-customer-env-changes** (unused) — Must not modify anything in the customer's cloud environment. Blocks AWS/Azure CLI commands targeting non-hackathon accounts, and any Blueprint automation against customer portals. (0 invocations)
- **ep-incident-response/no-data-exfil** (unused) — Customer incident data must NEVER leave the local laptop. Blocks any tool that could transmit EP investigation results externally: email, Teams, wiki, Slack, HTTP POST to external services, etc. Code (no customer data) can go to tmemu GitHub. Investigation results stay local. (0 invocations)
- **ep-incident-response/v1-read-only** (unused) — EP incident response must NEVER modify the customer's V1 environment. This gate blocks any V1 API call that could write, update, or delete data. Read-only operations (GET) are allowed. (0 invocations)
- **hackathon26/use-workers** (unused) — Local Claude implemented features directly instead of delegating to fleet workers. Enforce: local Claude manages fleet, workers implement features. Blocks Edit/Write to implementation files in any project with specs/. Blocks Bash commands that look like implementation work (npm test, node app, etc.) Only exception: CCC infrastructure (hooks, rules, fleet scripts, CF templates, dispatcher). All feature implementation goes to workers via: bash scripts/fleet/api-submit.sh "task" (0 invocations)
- **_example-project/use-workers** (unused) — Example showing how project-scoped modules delegate work to remote workers. Example project-scoped module: delegate implementation to remote workers. Only runs when CLAUDE_PROJECT_DIR basename matches the folder name. Blocks Edit/Write to implementation files — only specs/plans/infra allowed locally. Rename this folder to match your project's directory name. (0 invocations)
- **_openclaw/tmemu-guard** (unused) — _tmemu/openclaw is the live production OpenClaw instance. Hook porting work must happen on a separate _grobomo/openclaw test instance in WSL. This gate blocks any edits to hook-related files in _tmemu/openclaw to prevent accidental modification of the production hook system. (0 invocations)

## Monitors & Setup (non-blocking)

| Event | Module | Purpose |
|-------|--------|---------|
| PostToolUse | commit-msg-check | Sloppy commit messages made PR history unreadable. Commit message check: warn... |
| PostToolUse | crlf-detector | On Windows, Write/Edit can produce CRLF line endings that break shell scripts... |
| PostToolUse | disk-space-detect | Companion to PreToolUse/disk-space-guard.js. Detects disk space errors in too... |
| PostToolUse | empty-output-detector | Claude treats empty command output as success — e.g., `ls screenshots/` retur... |
| PostToolUse | hook-autocommit | Hook module edits were lost because they were never committed to the hook-run... |
| PostToolUse | hook-health-monitor | Stop runner had exit(0) for blocks — TUI silently ignored autocontinue for mu... |
| PostToolUse | inter-project-audit | When Project A writes a TODO to Project B, there was no audit trail and no wa... |
| PostToolUse | result-review-gate | Claude reads test reports and PDFs, sees mostly-green results, and immediatel... |
| PostToolUse | rule-hygiene | Rules grew into multi-topic dump files that were hard to maintain. Rule hygie... |
| PostToolUse | settings-audit-log | Settings changes happened silently with no audit trail. Audit log: records al... |
| PostToolUse | test-coverage-check | Source files were modified but existing tests never ran, hiding regressions. ... |
| PostToolUse | troubleshoot-detector | Claude tried 3 wrong ways to call claude -p before finding the right pattern ... |
| PostToolUse | update-stale-docs | Dead code references and stale docs accumulate silently. When Claude edits co... |
| SessionStart | backup-check | Backups went stale for weeks without anyone noticing. SessionStart: check bac... |
| SessionStart | drift-check | Hook system broke silently after modules drifted from known-good state. Perio... |
| SessionStart | hook-self-test | Stop runner had exit(0) for blocks instead of exit(1). TUI silently ignored a... |
| SessionStart | inter-project-priority | When another project writes a TODO to this project, it means a real-world bug... |
| SessionStart | lesson-effectiveness | Self-analysis lessons were captured (T381) but never checked for repetition. ... |
| SessionStart | load-instructions | Important operational context was missing at session start. SessionStart: inj... |
| SessionStart | load-lessons | Self-analysis generates lessons from interrupts, but those lessons are only u... |
| SessionStart | openclaw-checkin | OpenClaw needs to know when sessions start to track active workers. T-OC1: Au... |
| SessionStart | project-health | Broken hook runners silently failed, leaving gates unenforced. SessionStart: ... |
| SessionStart | reflection-score-inject | Every session starts blank. Without injecting the reflection score, Claude ha... |
| SessionStart | session-cleanup | Session-scoped temp files (.claude-*-<ppid>) accumulate when Claude Code tabs... |
| SessionStart | session-collision-detector | Context-reset spawns new Claude Code tabs that all work on the same project s... |
| SessionStart | terminal-title | With multiple Claude tabs open, they all show the same title making it imposs... |
| SessionStart | workflow-summary | On context reset, Claude loses track of which workflows are active. SessionSt... |
| Stop | auto-continue | Claude stops and lists options instead of doing the work. The message text in... |
| Stop | chat-export | Chat sessions contain valuable context that gets lost when sessions end. Auto... |
| Stop | config-sync | Config changes (rules, hooks, skills) made during sessions were lost because ... |
| Stop | drift-review | Claude drifted off-spec, doing unrelated work while tasks remained. |
| Stop | log-gotchas | Hard-won lessons from debugging sessions get lost between context resets. Thi... |
| Stop | mark-turn-complete | Need to detect when the user interrupts Claude mid-response. Interrupts are s... |
| Stop | never-give-up | Claude declares things "impossible" after one failed attempt. Past examples: ... |
| Stop | openclaw-checkin | OpenClaw (manager AI) needs real-time visibility into Claude Code session com... |
| Stop | push-unpushed | Commits sat on local branches, invisible to mobile monitoring. |
| Stop | reflection-score | You can't improve what you can't measure. Every session starts blank — no mem... |
| Stop | self-reflection | Hook-runner gates made wrong decisions (T321: branch T319 allowed edits for T... |
| Stop | session-brain-analysis | Self-reflection catches issues in-session but misses cross-session patterns. ... |
| Stop | test-before-done | Claude declares features "done" without running tests. The user then discover... |
| Stop | unresolved-issues-check | Claude ends sessions with tasks still marked "TESTING NOW" or "IN PROGRESS" i... |
| Stop | hackathon26/delegate-and-monitor | Stop hook kept stopping instead of monitoring fleet workers. hackathon26 stop... |
| UserPromptSubmit | hook-integrity-monitor | A background process silently overwrote live hook modules between prompts, st... |
| UserPromptSubmit | instruction-detector | User directives were treated as one-time context instead of persistent rules.... |
| UserPromptSubmit | interrupt-detector | User interrupts are social cues that Claude did something wrong. In real life... |
| UserPromptSubmit | prompt-logger | No record of what was asked across sessions, making handoffs lossy. UserPromp... |

