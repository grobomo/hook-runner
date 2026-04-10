# T400: Fix cross-project write protection

## Problem
Claude wrote .js files to hook-runner source from a ddei-email-security session, bypassing cross-project protection. Root cause: `cwd-drift-detector` is tagged `// WORKFLOW: cross-project-reset` but that workflow is disabled. Only `shtd` and `customer-data-guard` are active.

## Solution
Change cwd-drift-detector's workflow tag from `cross-project-reset` to `shtd` so it runs with the active workflow. Cross-project write protection is core development discipline, not an optional workflow.

## Changes
- `modules/PreToolUse/cwd-drift-detector.js` — change workflow tag to `shtd`
- Sync to live copy in `~/.claude/hooks/run-modules/`

## Test Cases
1. Verify module loads with shtd workflow tag
2. Existing cwd-drift tests still pass (test-T321 suite covers drift scenarios)
