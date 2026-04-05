# Spec: Publish-Ready hook-runner

## WHY
hook-runner has grown from a personal tool to a reusable system with 35+ modules,
a workflow engine, and a full CLI. But it's not shareable yet — modules have hardcoded
paths, the README is outdated after the workflow refactor, onboarding requires manual
steps, and uninstall doesn't fully restore original state. Fix all of this so anyone
can `npx grobomo/hook-runner` and have a working system in one command.

## Problem
1. **Hardcoded paths**: cwd-drift-detector, config-sync, claude-p-pattern reference
   `~/Documents/ProjectsCL1` and specific usernames. CI catches these on push but
   modules should be portable by design, not by CI enforcement.
2. **Docs drift**: README documents pre-workflow architecture. Workflow commands,
   CRUD automation, and several new modules are underdocumented.
3. **Onboarding friction**: `npx grobomo/hook-runner` runs setup wizard but the
   wizard doesn't offer a default workflow. New users get bare modules with no
   guidance on which to enable.
4. **Uninstall gaps**: `--uninstall` removes runners from settings.json but doesn't
   restore the user's original settings.json from backup.
5. **CI coverage**: test.yml only runs 5 of 24 test suites. New tests (workflow,
   timing, T105+) never run in CI.

## Solution
Four phases: Clean → Harden → Document → Ship.

### Phase 1: Clean (remove hardcoded values, make modules portable)
- Audit all .js modules for hardcoded absolute paths
- Replace with `os.homedir()`, `process.env.CLAUDE_PROJECT_DIR`, `path.resolve`
- Modules that need user-specific config read from env vars or `modules.yaml`
- CI secret-scan already blocks personal paths — this prevents them at source

### Phase 2: Harden (onboarding + uninstall + CI)
- Setup wizard offers "Enable default workflows?" (shtd + messaging-safety)
- `--uninstall` restores settings.json from most recent backup in `archive/`
- CI test.yml runs all test suites (not just 5)
- `--health` validates no hardcoded paths in installed modules

### Phase 3: Document (comprehensive README rewrite)
- Rewrite README around workflows as the primary concept
- Add "What is a workflow?" section before diving into modules
- Document all CLI commands with examples
- Add troubleshooting section (common errors, how to debug)
- Update CLAUDE.md and SKILL.md to match

### Phase 4: Ship (publish + announce)
- Version bump to 2.0.0 (breaking: workflow-first, portable modules)
- Sync to marketplace (claude-code-skills)
- Verify `npx grobomo/hook-runner` works end-to-end on clean machine (CI)
- Update package.json description and keywords for discoverability

## Success Criteria
- `grep -rn 'C:\\Users' modules/ setup.js` returns 0 results (excluding test fixtures)
- `npx grobomo/hook-runner` on a fresh machine completes setup with default workflows
- `node setup.js --uninstall --confirm` restores original settings.json
- CI runs all test suites and secret-scan
- README explains workflows before modules
