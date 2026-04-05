# Plan: Publish-Ready hook-runner

## Approach
Sequential phases — each builds on the previous. Clean first so docs/publish
don't ship broken code.

## Phase 1: Clean (T201-T204)
Strip hardcoded paths from all modules. Use `os.homedir()` + env vars.
Run secret-scan locally after each change to verify.

## Phase 2: Harden (T205-T209)
Fix onboarding UX, uninstall restore, CI coverage. Each gets its own test.

## Phase 3: Document (T210-T213)
Rewrite README, CLAUDE.md, SKILL.md. No code changes — pure docs.

## Phase 4: Ship (T214-T216)
Version bump, marketplace sync, end-to-end verify.

## Risk
- Modules with hardcoded paths may break when parameterized (test-first mitigates)
- README rewrite is large — split into sections to keep PRs reviewable
- `npx` install depends on GitHub raw content — test in CI, not just local
