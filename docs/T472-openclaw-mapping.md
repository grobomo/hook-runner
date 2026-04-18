# T472: Hook-Runner → OpenClaw Module Mapping

## Event Mapping

| Hook-Runner Event | OpenClaw Equivalent | Type | Status |
|---|---|---|---|
| PreToolUse | Plugin SDK `before_tool_call` | Plugin hook | Available now |
| PostToolUse | Plugin SDK `after_tool_call` | Plugin hook | Available now |
| SessionStart | Standalone `agent:bootstrap` | Hook event | Available now |
| Stop | Standalone `command:stop` | Hook event | Available now |
| UserPromptSubmit | (none) | N/A | Blocked by design in hook-runner too |

**Key gap**: PreToolUse/PostToolUse require building an OpenClaw **plugin** (not just a hook script).
Standalone `tool:before`/`tool:after` events are not yet released (issues #7597, #60943).

## Input Format Differences

### Hook-Runner (CommonJS)
```js
module.exports = function(input) {
  // input.tool_name: "Bash", "Edit", "Write", etc.
  // input.tool_input: { command: "...", file_path: "...", ... }
  // input._git: { branch: "main", ... } (injected by runner)
  // Return null to pass, {decision: "block", reason: "..."} to block
};
```

### OpenClaw Plugin SDK (TypeScript)
```ts
export default {
  hooks: {
    before_tool_call({ tool, args, context }) {
      // tool: string (tool name)
      // args: object (tool arguments)
      // context: { session, channel, config }
      // Return { action: "allow" } or { action: "deny", reason: "..." }
    }
  }
};
```

## Module Categories

### Portable (27) — Direct port or minor adaptation

These modules enforce generic development practices. Logic transfers cleanly.

| Module | Event | OpenClaw Event | Adaptation Notes |
|---|---|---|---|
| `archive-not-delete` | PreToolUse | before_tool_call | Change return format |
| `aws-tagging-gate` | PreToolUse | before_tool_call | Change return format |
| `block-local-docker` | PreToolUse | before_tool_call | Change return format |
| `commit-quality-gate` | PreToolUse | before_tool_call | Change return format |
| `crlf-ssh-key-check` | PreToolUse | before_tool_call | Change return format |
| `deploy-gate` | PreToolUse | before_tool_call | Change return format |
| `deploy-history-reminder` | PreToolUse | before_tool_call | Change return format, git log reading |
| `disk-space-guard` | PreToolUse | before_tool_call | Change return format |
| `env-var-check` | PreToolUse | before_tool_call | Change return format |
| `force-push-gate` | PreToolUse | before_tool_call | Change return format |
| `git-destructive-guard` | PreToolUse | before_tool_call | Change return format |
| `git-rebase-safety` | PreToolUse | before_tool_call | Change return format |
| `messaging-safety-gate` | PreToolUse | before_tool_call | Change return format |
| `no-adhoc-commands` | PreToolUse | before_tool_call | Change return format |
| `no-focus-steal` | PreToolUse | before_tool_call | Change return format |
| `no-fragile-heuristics` | PreToolUse | before_tool_call | Change return format |
| `no-hardcoded-paths` | PreToolUse | before_tool_call | Change return format |
| `preserve-iterated-content` | PreToolUse | before_tool_call | Change return format |
| `pr-per-task-gate` | PreToolUse | before_tool_call | Change return format |
| `root-cause-gate` | PreToolUse | before_tool_call | Change return format |
| `secret-scan-gate` | PreToolUse | before_tool_call | Change return format |
| `unresolved-issues-gate` | PreToolUse | before_tool_call | Reads TODO.md |
| `victory-declaration-gate` | PreToolUse | before_tool_call | Change return format |
| `why-reminder` | PreToolUse | before_tool_call | Change return format |
| `commit-msg-check` | PostToolUse | after_tool_call | Change return format |
| `crlf-detector` | PostToolUse | after_tool_call | Change return format |
| `test-coverage-check` | PostToolUse | after_tool_call | Change return format |
| `result-review-gate` | PostToolUse | after_tool_call | Injects review checklist |
| `rule-hygiene` | PostToolUse | after_tool_call | Validates rule file format |

### Adaptable (18) — Concept transfers but needs significant rework

These modules depend on git state, workflow files, or project structure that
OpenClaw handles differently.

| Module | Event | OpenClaw Event | Adaptation Notes |
|---|---|---|---|
| `branch-pr-gate` | PreToolUse | before_tool_call | Git branch detection differs |
| `commit-counter-gate` | PreToolUse | before_tool_call | State tracking (uses file counter) |
| `cwd-drift-detector` | PreToolUse | before_tool_call | Project boundary detection |
| `enforcement-gate` | PreToolUse | before_tool_call | Requires git + TODO.md presence check |
| `cross-project-todo-gate` | PreToolUse | before_tool_call | Multi-project path detection |
| `pr-first-gate` | PreToolUse | before_tool_call | GitHub API integration |
| `publish-json-guard` | PreToolUse | before_tool_call | File path protection |
| `remote-tracking-gate` | PreToolUse | before_tool_call | Git remote tracking check |
| `settings-change-gate` | PreToolUse | before_tool_call | Config modification guard |
| `spec-before-code-gate` | PreToolUse | before_tool_call | Spec workflow enforcement |
| `spec-gate` | PreToolUse | before_tool_call | Full spec/task/branch workflow — complex |
| `task-completion-gate` | PreToolUse | before_tool_call | PR evidence for task marking |
| `test-checkpoint-gate` | PreToolUse | before_tool_call | Test script detection |
| `disk-space-detect` | PostToolUse | after_tool_call | State flag persistence |
| `hook-health-monitor` | PostToolUse | after_tool_call | Crash/timeout tracking |
| `troubleshoot-detector` | PostToolUse | after_tool_call | Pattern tracking across calls |
| `empty-output-detector` | PostToolUse | after_tool_call | Output analysis |
| `update-stale-docs` | PostToolUse | after_tool_call | Doc freshness detection |
| `settings-audit-log` | PostToolUse | after_tool_call | Config audit trail |

### Not Portable (23) — Hook-runner meta, Claude Code specific, or infra-specific

These modules are tightly coupled to hook-runner internals, Claude Code features,
or specific infrastructure setups.

| Module | Event | Reason |
|---|---|---|
| `blueprint-no-sleep` | PreToolUse | Blueprint MCP specific |
| `claude-p-pattern` | PreToolUse | Claude Code `claude -p` specific |
| `continuous-claude-gate` | PreToolUse | Claude Code workflow tracking |
| `gh-auto-gate` | PreToolUse | EMU account management |
| `gsd-branch-gate` | PreToolUse | GSD workflow specific |
| `gsd-plan-gate` | PreToolUse | GSD workflow specific |
| `gsd-pr-gate` | PreToolUse | GSD workflow specific |
| `hook-editing-gate` | PreToolUse | Meta: enforces hook format rules |
| `hook-system-reminder` | PreToolUse | Meta: reminder about hook-runner |
| `instruction-to-hook-gate` | PreToolUse | Meta: converts directives to hooks |
| `no-hook-bypass` | PreToolUse | Meta: prevents hook circumvention |
| `no-nested-claude` | PreToolUse | Claude Code specific |
| `no-passive-rules` | PreToolUse | Meta: prefers hooks over .md rules |
| `no-rules-gate` | PreToolUse | Meta: blocks rules/ directory |
| `openclaw-tmemu-guard` | PreToolUse | Tmemu installation specific |
| `reflection-gate` | PreToolUse | Self-reflection subsystem |
| `settings-hooks-gate` | PreToolUse | Meta: blocks hooks in settings.json |
| `worker-loop` | PreToolUse | Fleet worker specific |
| `workflow-compliance-gate` | PreToolUse | Meta: workflow system enforcement |
| `workflow-gate` | PreToolUse | Meta: step order enforcement |
| `windowless-spawn-gate` | PreToolUse | Windows-specific module writing |
| `worktree-gate` | PreToolUse | Git worktree specific |
| `hook-autocommit` | PostToolUse | Meta: auto-commits hook edits |

### SessionStart Modules (12) → `agent:bootstrap`

All SessionStart modules map to OpenClaw `agent:bootstrap` event.
These are non-blocking (inject context, not gates).

| Module | Category | Notes |
|---|---|---|
| `backup-check` | Portable | Check backup freshness |
| `drift-check` | Portable | Snapshot drift detection |
| `hook-self-test` | Not portable | Hook-runner specific self-test |
| `lesson-effectiveness` | Adaptable | Needs lesson storage adaptation |
| `load-instructions` | Portable | Inject working instructions |
| `load-lessons` | Adaptable | Needs lesson file format adaptation |
| `project-health` | Portable | General health check |
| `reflection-score-inject` | Not portable | Reflection subsystem specific |
| `session-cleanup` | Portable | Temp file sweep |
| `session-collision-detector` | Portable | Multi-session detection |
| `terminal-title` | Portable | Set terminal title |
| `workflow-summary` | Adaptable | Workflow state injection |

### Stop Modules (13) → `command:stop`

All Stop modules map to OpenClaw `command:stop` event.

| Module | Category | Notes |
|---|---|---|
| `auto-continue` | Portable | Force continuation |
| `chat-export` | Portable | Export session to HTML |
| `config-sync` | Adaptable | Config backup mechanism differs |
| `drift-review` | Adaptable | Spec matching logic |
| `log-gotchas` | Portable | Lesson capture |
| `mark-turn-complete` | Portable | Turn marker writing |
| `never-give-up` | Portable | Blocks "impossible" |
| `push-unpushed` | Portable | Git push reminder |
| `reflection-score` | Not portable | Reflection subsystem |
| `self-reflection` | Not portable | LLM-powered reflection |
| `session-brain-analysis` | Not portable | Unified-brain specific |
| `test-before-done` | Portable | Test reminder |
| `unresolved-issues-check` | Portable | Stale task detection |

## Summary

| Category | PreToolUse | PostToolUse | SessionStart | Stop | Total |
|---|---|---|---|---|---|
| **Portable** | 24 | 5 | 5 | 8 | **42** |
| **Adaptable** | 13 | 6 | 3 | 2 | **24** |
| **Not portable** | 22 | 1 | 2 | 3 | **28** |
| **Total** | 59 | 12 | 10 | 13 | **94** |

**66 of 94 modules (70%) are portable or adaptable to OpenClaw.**

## Recommended Pilot Modules (T473)

Best candidates for first port — high value, simple logic, widely applicable:

1. **`force-push-gate`** — Simple, universally needed, blocks `git push --force`
2. **`secret-scan-gate`** — High security value, scans for API keys/tokens
3. **`commit-quality-gate`** — Widely applicable, checks commit message quality

These three cover different patterns:
- Bash command inspection (force-push-gate)
- File content analysis (secret-scan-gate)
- Git operation interception (commit-quality-gate)

## Implementation Strategy

1. Build as an **OpenClaw plugin** (not standalone hooks) since `before_tool_call`/`after_tool_call` are only available in Plugin SDK
2. Single plugin `coconut-hook-runner` that registers all ported modules
3. Module dispatch inside the plugin mirrors hook-runner's `load-modules.js` pattern
4. Config file (`modules.yaml` equivalent) controls which modules are active
5. SessionStart/Stop modules can be standalone hooks using `agent:bootstrap`/`command:stop`

## Ported Modules (T487)

18 modules ported to `openclaw-plugin/index.ts` (plugin v0.2.0):

### before_tool_call (13)
| Module | Status | Original |
|---|---|---|
| `force-push-gate` | T473 pilot | PreToolUse |
| `secret-scan-gate` | T473 pilot | PreToolUse |
| `commit-quality-gate` | T473 pilot | PreToolUse |
| `git-destructive-guard` | T487 batch | PreToolUse |
| `archive-not-delete` | T487 batch | PreToolUse |
| `git-rebase-safety` | T487 batch | PreToolUse |
| `no-hardcoded-paths` | T487 batch | PreToolUse |
| `victory-declaration-gate` | T487 batch | PreToolUse |
| `root-cause-gate` | T487 batch | PreToolUse |
| `no-fragile-heuristics` | T487 batch | PreToolUse |
| `no-focus-steal` | T487 batch | PreToolUse |
| `crlf-ssh-key-check` | T487 batch | PreToolUse |
| `unresolved-issues-gate` | T487 batch | PreToolUse |

### after_tool_call (5)
| Module | Status | Original |
|---|---|---|
| `commit-msg-check` | T487 batch | PostToolUse |
| `crlf-detector` | T487 batch | PostToolUse |
| `test-coverage-check` | T487 batch | PostToolUse |
| `result-review-gate` | T487 batch | PostToolUse |
| `rule-hygiene` | T487 batch | PostToolUse |

### Remaining portable (not yet ported)
- PreToolUse: `aws-tagging-gate`, `block-local-docker`, `deploy-gate`, `deploy-history-reminder`, `disk-space-guard`, `env-var-check`, `messaging-safety-gate`, `no-adhoc-commands`, `preserve-iterated-content`, `pr-per-task-gate`
- SessionStart: `backup-check`, `drift-check`, `load-instructions`, `project-health`, `session-cleanup`, `session-collision-detector`, `terminal-title`
- Stop: `auto-continue`, `chat-export`, `log-gotchas`, `mark-turn-complete`, `never-give-up`, `push-unpushed`, `test-before-done`, `unresolved-issues-check`
