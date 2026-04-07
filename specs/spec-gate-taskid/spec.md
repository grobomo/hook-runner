# Spec-Gate Task ID Priority

## Problem
When a branch like `242-T373-module-review-tab` has both a task ID (T373) and feature words ("module", "review", "tab"), the spec gate's fuzzy word matching can match the wrong spec directory. Example: "review" matches `specs/code-review-cleanup/` (score 1), which has all tasks completed, causing a false block even though T373 is a valid unchecked task.

## Solution
When a branch has a task ID (TXXX) that was already validated by the T321 check:
1. Track WHERE the task was found (which spec dir, or TODO.md)
2. If found in a spec's tasks.md, use that spec as the authoritative match (skip fuzzy)
3. If found only in TODO.md (not in any spec), skip fuzzy spec matching entirely
4. Only fall back to fuzzy word matching when no taskId exists in the branch

## Scope
- `modules/PreToolUse/spec-gate.js` — modify T321 check to record match location, modify fuzzy matching to defer to task ID match
