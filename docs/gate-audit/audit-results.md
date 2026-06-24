# Gate Architecture Audit Results

=== T812: Gate Architecture Audit Report ===
Generated: 2026-06-04T11:03

## Module Summary
  Total modules: 172 (+ 6 helpers)
  With issues:   159/172
  With tests:    148/172
  Live deployed: 170/172
  With logging:  52/172
  Incident hist: 44/172
  FP escape:     114/121 blocking gates

## Architecture Compliance (T812)
  Mechanical:    154/172
  Haiku-powered: 18/172
  Inversions:    2 modules (permissive on missing prerequisite)
  Never fired:   129 live modules with 0 log entries
  PostToolUse blockers: 15 (should be 0 — PostToolUse must never block)

## PreToolUse (96 modules: 91 mechanical, 5 haiku, 86 with issues)
  ! archive-not-delete.js  [no-log, no-incident]
    audit-log-protect-gate.js
  ! automate-everything-gate.js  [no-log, no-incident, never-fired]
  ! aws-tagging-gate.js  [no-log, no-incident, never-fired]
  ! block-local-docker.js  [no-log, no-incident, never-fired]
  ! blueprint-guidance-gate.js  [no-incident, never-fired]
  ! blueprint-no-sleep.js  [no-log, no-incident, never-fired]
  ! blueprint-only-browser-gate.js  [never-fired]
  ! branch-pr-gate.js  [no-log, no-incident, never-fired]
  ! claude-p-pattern.js  [no-log, no-incident, never-fired]
  ! close-old-tab-gate.js  [never-fired]
  ! commit-counter-gate.js  [no-log, no-incident, never-fired]
  ! commit-quality-gate.js  [no-log, no-incident]
  ! continuous-claude-gate.js  [no-log, no-incident, never-fired]
  ! crlf-ssh-key-check.js  [no-log, no-incident]
  ! cross-project-todo-gate.js  [no-log, no-incident, never-fired]
  ! cwd-drift-detector.js  [no-log, no-incident, never-fired]
  ! rdp-testbox-gate.js  [no-log, no-incident, never-fired]
  ! share-is-generic.js  [no-test, no-log, no-incident, never-fired]
  ! deploy-gate.js  [no-log, no-incident, never-fired]
  ! deploy-history-reminder.js  [no-log, no-incident, never-fired]
    deploy-test-gate.js
  ! disk-space-guard.js  [no-log, no-incident]
  ! e2e-self-report-gate.js  [no-test, no-log, no-incident, never-fired]
  ! enforcement-gate.js  [no-log, no-incident, never-fired]
  ! env-var-check.js  [no-log, no-incident]
  ! no-customer-env-changes.js  [no-test, no-log, no-incident, never-fired]
  ! no-data-exfil.js  [no-test, no-log, no-incident, never-fired]
  ! v1-read-only.js  [no-test, no-log, no-incident, never-fired]
  ! force-push-gate.js  [no-log, no-incident]
    gate-quality-gate.js
  ! gh-auto-gate.js  [no-log, no-incident]
  ! git-destructive-guard.js  [no-log, no-incident]
  ! git-rebase-safety.js  [no-log, no-incident]
  ! gsd-branch-gate.js  [no-log, no-incident, never-fired]
  ! gsd-gate.js  [no-test, no-log, no-incident, never-fired]
  ! gsd-plan-gate.js  [no-log, no-incident, never-fired]
  ! gsd-pr-gate.js  [no-log, no-incident, never-fired]
  ! use-workers.js  [no-test, no-log, no-incident, never-fired]
  ! hook-editing-gate.js  [no-log, no-incident]
  ! hook-log-review-gate.js  [no-incident, never-fired]
  ! hook-system-reminder.js  [no-log, no-incident, never-fired]
  ! instruction-to-hook-gate.js  [no-log, no-incident, never-fired]
  ! inter-project-priority-gate.js  [no-log, no-incident, never-fired]
  ! dashboard-deploy-reminder-gate.js  [no-test, never-fired]
  ! no-local-dashboard-gate.js  [no-test, haiku, never-fired]
    mandate-gate.js  [haiku]
    mcp-manager-gate.js
  ! messaging-safety-gate.js  [no-log, no-incident, never-fired]
  ! no-adhoc-commands.js  [no-log, no-incident, never-fired]
  ! no-focus-steal.js  [no-log, no-incident]
  ! no-fragile-heuristics.js  [no-log, no-incident, never-fired]
  ! no-hardcoded-paths.js  [no-log, no-incident]
  ! no-hook-bypass.js  [no-log, no-incident]
  ! no-lessons-file-gate.js  [no-log, no-incident, never-fired]
  ! no-native-memory-gate.js  [no-log]
  ! no-nested-claude.js  [no-log, no-incident]
  ! no-passive-rules.js  [no-log, no-incident, never-fired]
  ! no-playwright-direct.js  [no-log, no-incident, never-fired]
  ! no-polling-gate.js  [no-log, no-incident, never-fired]
  ! no-rewrite-gate.js  [no-incident]
  ! portal-verify-gate.js  [no-test]
  ! pr-first-gate.js  [no-log, no-incident, never-fired]
  ! pr-per-task-gate.js  [no-log, no-incident, never-fired]
  ! preserve-iterated-content.js  [no-log, no-incident, never-fired]
    process-kill-gate.js
  ! publish-json-guard.js  [no-log, no-incident]
    reflection-first-gate.js
  ! reflection-gate.js  [no-log, no-incident, never-fired]
  ! remote-tracking-gate.js  [no-log, no-incident, never-fired]
  ! root-cause-gate.js  [no-log, no-incident, never-fired]
  ! secret-scan-gate.js  [no-log, no-incident]
  ! settings-change-gate.js  [no-log, no-incident]
  ! settings-hooks-gate.js  [no-log, no-incident]
    sibling-session-detect-gate.js  [haiku]
  ! spec-before-code-gate.js  [no-log, no-incident, never-fired]
  ! spec-gate.js  [no-incident, never-fired]
  ! stop-fired-check-gate.js  [no-test, no-log]
  ! task-completion-gate.js  [no-log, no-incident, never-fired]
  ! test-checkpoint-gate.js  [no-log, no-incident, never-fired]
    todo-first-gate.js
  ! transcript-shared-reader-gate.js  [no-test, haiku]
  ! tunnel-check-gate.js  [no-log, no-incident, never-fired]
  ! unresolved-issues-gate.js  [no-log, no-incident, never-fired]
  ! victory-declaration-gate.js  [no-log, haiku, never-fired]
    violation-gate.js
  ! vision-doc-gate.js  [never-fired]
  ! why-reminder.js  [no-log, no-incident, never-fired]
  ! windowless-spawn-gate.js  [no-log, no-incident]
  ! worker-loop.js  [no-log, no-incident, never-fired]
  ! workflow-compliance-gate.js  [no-log, no-incident, never-fired]
  ! workflow-gate.js  [no-log, no-incident, never-fired]
  ! worktree-gate.js  [no-log, no-incident, never-fired]
  ! worktree-scope-guard-gate.js  [no-test, never-fired]
  ! use-workers.js  [no-test, no-log, no-incident, no-FP-escape, never-fired]
  ! tmemu-guard.js  [no-log, no-incident, no-FP-escape, never-fired]

## PostToolUse (30 modules: 28 mechanical, 2 haiku, 27 with issues)
  ! background-task-audit.js  [no-log, no-incident, never-fired]
  ! behavioral-claude-md-check.js
  ! commit-msg-check.js  [no-log, no-incident, inversion, never-fired]
  ! correction-to-gate-check.js  [no-incident]
  ! crlf-detector.js  [no-log, no-incident]
  ! decision-log-gate.js  [never-fired]
  ! disk-space-detect.js  [no-log, no-incident, never-fired]
  ! empty-output-detector.js  [no-log, no-incident, never-fired]
  ! false-positive-followup-gate.js  [no-incident, never-fired]
  ! file-naming-check.js  [haiku, never-fired]
  ! gate-spec-required-check.js  [no-incident, never-fired]
    git-commit-reminder-check.js
  ! hook-autocommit.js  [no-log, no-incident, never-fired]
  ! hook-health-monitor.js  [no-log, no-incident, never-fired]
  ! inter-project-audit.js  [no-log, no-incident, never-fired]
  ! no-infra-excuse.js  [no-log, no-incident, never-fired]
  ! portal-evidence-recorder-gate.js  [no-test, never-fired]
    rca-write-check.js
  ! result-review-gate.js  [no-log, no-incident, never-fired]
  ! rule-hygiene.js  [no-log, no-incident, never-fired]
  ! script-not-oneoff-check.js  [never-fired]
  ! settings-audit-log.js  [no-log, no-incident, never-fired]
    spirit-check.js  [haiku]
  ! test-coverage-check.js  [no-log, no-incident, never-fired]
  ! test-evidence.js  [no-log, no-incident, never-fired]
  ! tool-event-guard.js  [no-log]
  ! troubleshoot-detector.js  [no-log, no-incident, never-fired]
  ! update-stale-docs.js  [no-log, no-incident, never-fired]
  ! user-correction-detector.js  [no-log, no-incident, never-fired]
  ! verify-todo-completion-gate.js  [never-fired]

## Stop (23 modules: 15 mechanical, 8 haiku, 23 with issues)
  ! auto-continue-gate.js  [no-FP-escape, haiku, never-fired]
  ! stop-analysis-gate.js  [no-FP-escape, haiku, never-fired]
  ! abandoned-request-check.js  [never-fired]
  ! dashboard-deploy-verify-gate.js  [no-test, not-live, haiku]
  ! screenshot-public-site-gate.js  [no-test, not-live, haiku]
  ! auto-continue-gate.js  [haiku, never-fired]
  ! auto-continue.js  [no-log, no-incident, no-FP-escape, never-fired]
  ! chat-export.js  [no-log, no-incident, never-fired]
  ! config-sync.js  [no-log, no-incident, never-fired]
  ! drift-review.js  [no-log, no-incident, never-fired]
  ! delegate-and-monitor.js  [no-test, no-log, no-incident, never-fired]
  ! log-gotchas.js  [no-log, no-incident, never-fired]
  ! mark-turn-complete.js  [no-log, no-incident, never-fired]
  ! never-give-up.js  [no-log, no-incident, never-fired]
  ! push-unpushed.js  [no-log, no-incident, never-fired]
  ! reflection-score.js  [no-incident, never-fired]
  ! self-healing-gate.js  [haiku, never-fired]
  ! self-reflection.js  [no-incident, haiku, never-fired]
  ! session-brain-analysis.js  [no-log, no-incident, never-fired]
  ! status-emitter-guard.js  [no-log, never-fired]
  ! stop-analysis-gate.js  [no-incident, no-FP-escape, haiku, never-fired]
  ! test-before-done.js  [no-log, no-incident, never-fired]
  ! unresolved-issues-check.js  [no-log, no-incident, never-fired]

## SessionStart (19 modules: 16 mechanical, 3 haiku, 19 with issues)
  ! api-watcher.js  [no-log, no-incident, never-fired]
  ! backup-check.js  [no-log, no-incident, inversion, never-fired]
  ! drift-check.js  [no-log, no-incident, never-fired]
  ! health-report-check.js  [haiku, never-fired]
  ! hook-self-test.js  [no-incident, never-fired]
  ! inter-project-priority.js  [no-log, no-incident, never-fired]
  ! lesson-effectiveness.js  [no-log, no-incident, never-fired]
  ! load-instructions.js  [no-log, no-incident, never-fired]
  ! load-lessons.js  [no-log, no-incident, never-fired]
  ! project-health.js  [no-incident, never-fired]
  ! proxy-routing-check-gate.js  [no-test, haiku, never-fired]
  ! rca-read-check.js  [never-fired]
  ! reflection-score-inject.js  [no-log, no-incident, no-FP-escape, never-fired]
  ! session-cleanup.js  [no-log, no-incident, never-fired]
  ! session-collision-detector.js  [no-log, no-incident, never-fired]
  ! stop-hook-verify-check.js  [no-test, never-fired]
  ! terminal-title.js  [no-log, no-incident, never-fired]
  ! unauthorized-change-check.js  [haiku, never-fired]
  ! workflow-summary.js  [no-log, no-incident, never-fired]

## UserPromptSubmit (4 modules: 4 mechanical, 0 haiku, 4 with issues)
  ! hook-integrity-monitor.js  [no-test, no-log, no-incident, never-fired]
  ! instruction-detector.js  [no-test, no-log, no-incident, never-fired]
  ! interrupt-detector.js  [no-test, no-log, no-incident, never-fired]
  ! prompt-logger.js  [no-test, no-incident, never-fired]

## Stop Rules (32 rules, 1 with issues)
    01-never-ask-permission.yaml — never-ask-permission
    02-never-give-up.yaml — never-give-up
    03-suggest-context-reset.yaml — suggest-context-reset
    04-todo-awareness.yaml — todo-awareness
    05-cross-project-dispatch.yaml — cross-project-dispatch
    06-specs-need-docs-and-tests.yaml — specs-need-docs-and-tests
    07-incomplete-delivery.yaml — incomplete-delivery
    08-obvious-follow-up.yaml — obvious-follow-up
    09-e2e-before-done.yaml — e2e-before-done
    10-document-config-files.yaml — document-config-files
    11-todo-maintenance.yaml — todo-maintenance
    12-unaddressed-tangents.yaml — unaddressed-tangents
    13-fix-false-positive-gates.yaml — fix-false-positive-gates
    14-never-stop-uncertain.yaml — never-stop-uncertain
    15-keep-working.yaml — keep-working
  ! 15-metacognate-next.yaml — 15-metacognate-next.yaml
    Issues: missing name, missing check, missing action
    16-user-instruction-override.yaml — user-instruction-override
    17-answer-claudes-question.yaml — answer-claudes-question
    18-blueprint-cost-verify.yaml — blueprint-cost-verify
    19-never-ask-user-to-click.yaml — never-ask-user-to-click
    20-prove-systems-work.yaml — prove-systems-work
    21-fix-needs-gate.yaml — fix-needs-gate
    22-correction-to-gate.yaml — correction-to-gate
    23-expert-decides-implementation.yaml — expert-decides-implementation
    24-band-aid-detection.yaml — band-aid-detection
    25-destructive-action-review.yaml — destructive-action-review
    26-system-health-awareness.yaml — system-health-awareness
    27-gate-block-followthrough.yaml — gate-block-followthrough
    28-priority-enforcement.yaml — priority-enforcement
    29-spec-before-code-review.yaml — spec-before-code-review
    30-gate-effectiveness-audit.yaml — gate-effectiveness-audit
    31-stagnation-detector.yaml — stagnation-detector

## Top Issues
  129x deployed but never fired in recent log (possibly broken)
  128x missing INCIDENT HISTORY
  120x no hook-log.jsonl logging
  31x missing TOOLS tag
  24x no test suite
  15x PostToolUse module blocks — should be PreToolUse or non-blocking warning
  7x blocks without FALSE POSITIVE escape
  3x missing WORKFLOW tag
  2x possible inversion pattern (permissive on missing prerequisite)

## Modules Without Tests
  PreToolUse/share-is-generic.js
  PreToolUse/e2e-self-report-gate.js
  PreToolUse/no-customer-env-changes.js
  PreToolUse/no-data-exfil.js
  PreToolUse/v1-read-only.js
  PreToolUse/gsd-gate.js
  PreToolUse/use-workers.js
  PreToolUse/dashboard-deploy-reminder-gate.js
  PreToolUse/no-local-dashboard-gate.js
  PreToolUse/portal-verify-gate.js
  PreToolUse/stop-fired-check-gate.js
  PreToolUse/transcript-shared-reader-gate.js
  PreToolUse/worktree-scope-guard-gate.js
  PreToolUse/use-workers.js
  PostToolUse/portal-evidence-recorder-gate.js
  Stop/dashboard-deploy-verify-gate.js
  Stop/screenshot-public-site-gate.js
  Stop/delegate-and-monitor.js
  SessionStart/proxy-routing-check-gate.js
  SessionStart/stop-hook-verify-check.js
  UserPromptSubmit/hook-integrity-monitor.js
  UserPromptSubmit/instruction-detector.js
  UserPromptSubmit/interrupt-detector.js
  UserPromptSubmit/prompt-logger.js

## Architecture Violations (T812)
### PostToolUse modules that block (should be non-blocking)
  ! background-task-audit.js  — move to PreToolUse or convert to warning
  ! behavioral-claude-md-check.js  — move to PreToolUse or convert to warning
  ! commit-msg-check.js  — move to PreToolUse or convert to warning
  ! correction-to-gate-check.js  — move to PreToolUse or convert to warning
  ! crlf-detector.js  — move to PreToolUse or convert to warning
  ! disk-space-detect.js  — move to PreToolUse or convert to warning
  ! empty-output-detector.js  — move to PreToolUse or convert to warning
  ! false-positive-followup-gate.js  — move to PreToolUse or convert to warning
  ! gate-spec-required-check.js  — move to PreToolUse or convert to warning
  ! no-infra-excuse.js  — move to PreToolUse or convert to warning
  ! result-review-gate.js  — move to PreToolUse or convert to warning
  ! rule-hygiene.js  — move to PreToolUse or convert to warning
  ! test-coverage-check.js  — move to PreToolUse or convert to warning
  ! troubleshoot-detector.js  — move to PreToolUse or convert to warning
  ! user-correction-detector.js  — move to PreToolUse or convert to warning

### Inversion patterns (permissive when prerequisite missing)
  ? PostToolUse/commit-msg-check.js
  ? SessionStart/backup-check.js

### Deployed but never fired (possibly broken)
  ? PreToolUse/automate-everything-gate.js
  ? PreToolUse/aws-tagging-gate.js
  ? PreToolUse/block-local-docker.js
  ? PreToolUse/blueprint-guidance-gate.js
  ? PreToolUse/blueprint-no-sleep.js
  ? PreToolUse/blueprint-only-browser-gate.js
  ? PreToolUse/branch-pr-gate.js
  ? PreToolUse/claude-p-pattern.js
  ? PreToolUse/close-old-tab-gate.js
  ? PreToolUse/commit-counter-gate.js
  ? PreToolUse/continuous-claude-gate.js
  ? PreToolUse/cross-project-todo-gate.js
  ? PreToolUse/cwd-drift-detector.js
  ? PreToolUse/rdp-testbox-gate.js
  ? PreToolUse/share-is-generic.js
  ? PreToolUse/deploy-gate.js
  ? PreToolUse/deploy-history-reminder.js
  ? PreToolUse/e2e-self-report-gate.js
  ? PreToolUse/enforcement-gate.js
  ? PreToolUse/no-customer-env-changes.js
  ? PreToolUse/no-data-exfil.js
  ? PreToolUse/v1-read-only.js
  ? PreToolUse/gsd-branch-gate.js
  ? PreToolUse/gsd-gate.js
  ? PreToolUse/gsd-plan-gate.js
  ? PreToolUse/gsd-pr-gate.js
  ? PreToolUse/use-workers.js
  ? PreToolUse/hook-log-review-gate.js
  ? PreToolUse/hook-system-reminder.js
  ? PreToolUse/instruction-to-hook-gate.js
  ? PreToolUse/inter-project-priority-gate.js
  ? PreToolUse/dashboard-deploy-reminder-gate.js
  ? PreToolUse/no-local-dashboard-gate.js
  ? PreToolUse/messaging-safety-gate.js
  ? PreToolUse/no-adhoc-commands.js
  ? PreToolUse/no-fragile-heuristics.js
  ? PreToolUse/no-lessons-file-gate.js
  ? PreToolUse/no-passive-rules.js
  ? PreToolUse/no-playwright-direct.js
  ? PreToolUse/no-polling-gate.js
  ? PreToolUse/pr-first-gate.js
  ? PreToolUse/pr-per-task-gate.js
  ? PreToolUse/preserve-iterated-content.js
  ? PreToolUse/reflection-gate.js
  ? PreToolUse/remote-tracking-gate.js
  ? PreToolUse/root-cause-gate.js
  ? PreToolUse/spec-before-code-gate.js
  ? PreToolUse/spec-gate.js
  ? PreToolUse/task-completion-gate.js
  ? PreToolUse/test-checkpoint-gate.js
  ? PreToolUse/tunnel-check-gate.js
  ? PreToolUse/unresolved-issues-gate.js
  ? PreToolUse/victory-declaration-gate.js
  ? PreToolUse/vision-doc-gate.js
  ? PreToolUse/why-reminder.js
  ? PreToolUse/worker-loop.js
  ? PreToolUse/workflow-compliance-gate.js
  ? PreToolUse/workflow-gate.js
  ? PreToolUse/worktree-gate.js
  ? PreToolUse/worktree-scope-guard-gate.js
  ? PreToolUse/use-workers.js
  ? PreToolUse/tmemu-guard.js
  ? PostToolUse/background-task-audit.js
  ? PostToolUse/commit-msg-check.js
  ? PostToolUse/decision-log-gate.js
  ? PostToolUse/disk-space-detect.js
  ? PostToolUse/empty-output-detector.js
  ? PostToolUse/false-positive-followup-gate.js
  ? PostToolUse/file-naming-check.js
  ? PostToolUse/gate-spec-required-check.js
  ? PostToolUse/hook-autocommit.js
  ? PostToolUse/hook-health-monitor.js
  ? PostToolUse/inter-project-audit.js
  ? PostToolUse/no-infra-excuse.js
  ? PostToolUse/portal-evidence-recorder-gate.js
  ? PostToolUse/result-review-gate.js
  ? PostToolUse/rule-hygiene.js
  ? PostToolUse/script-not-oneoff-check.js
  ? PostToolUse/settings-audit-log.js
  ? PostToolUse/test-coverage-check.js
  ? PostToolUse/test-evidence.js
  ? PostToolUse/troubleshoot-detector.js
  ? PostToolUse/update-stale-docs.js
  ? PostToolUse/user-correction-detector.js
  ? PostToolUse/verify-todo-completion-gate.js
  ? Stop/auto-continue-gate.js
  ? Stop/stop-analysis-gate.js
  ? Stop/abandoned-request-check.js
  ? Stop/auto-continue-gate.js
  ? Stop/auto-continue.js
  ? Stop/chat-export.js
  ? Stop/config-sync.js
  ? Stop/drift-review.js
  ? Stop/delegate-and-monitor.js
  ? Stop/log-gotchas.js
  ? Stop/mark-turn-complete.js
  ? Stop/never-give-up.js
  ? Stop/push-unpushed.js
  ? Stop/reflection-score.js
  ? Stop/self-healing-gate.js
  ? Stop/self-reflection.js
  ? Stop/session-brain-analysis.js
  ? Stop/status-emitter-guard.js
  ? Stop/stop-analysis-gate.js
  ? Stop/test-before-done.js
  ? Stop/unresolved-issues-check.js
  ? SessionStart/api-watcher.js
  ? SessionStart/backup-check.js
  ? SessionStart/drift-check.js
  ? SessionStart/health-report-check.js
  ? SessionStart/hook-self-test.js
  ? SessionStart/inter-project-priority.js
  ? SessionStart/lesson-effectiveness.js
  ? SessionStart/load-instructions.js
  ? SessionStart/load-lessons.js
  ? SessionStart/project-health.js
  ? SessionStart/proxy-routing-check-gate.js
  ? SessionStart/rca-read-check.js
  ? SessionStart/reflection-score-inject.js
  ? SessionStart/session-cleanup.js
  ? SessionStart/session-collision-detector.js
  ? SessionStart/stop-hook-verify-check.js
  ? SessionStart/terminal-title.js
  ? SessionStart/unauthorized-change-check.js
  ? SessionStart/workflow-summary.js
  ? UserPromptSubmit/hook-integrity-monitor.js
  ? UserPromptSubmit/instruction-detector.js
  ? UserPromptSubmit/interrupt-detector.js
  ? UserPromptSubmit/prompt-logger.js
