---
name: hook-runner
description: "Modular hook runner for Claude Code. Workflows group modules into enforceable pipelines."
keywords:
  - hook
  - hooks
  - runner
  - workflow
  - pretooluse
  - posttooluse
  - stop
  - sessionstart
  - enforcement
  - gate
  - module
  - shtd
  - gsd
  - starter
custom_commands:
  - name: setup
    command: "node \"$SKILL_DIR/setup.js\""
    description: "Run setup wizard — scan, report, backup, install"
  - name: report
    command: "node \"$SKILL_DIR/setup.js\" --report --open"
    description: "Generate and open HTML hooks report"
  - name: health
    command: "node \"$SKILL_DIR/setup.js\" --health"
    description: "Verify runners, modules, and settings"
  - name: workflow
    command: "node \"$SKILL_DIR/setup.js\" --workflow list"
    description: "List workflows with enabled state"
  - name: groups
    command: "node \"$SKILL_DIR/setup.js\" --groups"
    description: "List workflow groups with ON/OFF status"
  - name: audit
    command: "node \"$SKILL_DIR/setup.js\" --workflow audit"
    description: "Audit workflow coverage and orphan modules"
  - name: stats
    command: "node \"$SKILL_DIR/setup.js\" --stats"
    description: "Quick text summary of hook activity"
  - name: test
    command: "node \"$SKILL_DIR/setup.js\" --test"
    description: "Run all test suites"
  - name: demo
    command: "node \"$SKILL_DIR/setup.js\" --demo --fast"
    description: "Interactive demo — see hook-runner in action"
---

# hook-runner

Modular hook runner for Claude Code. Workflows group related modules into enforceable pipelines. Enable a workflow and its modules activate together.

## Quick Start

```
npx grobomo/hook-runner --yes       # install + enable default workflows
/hook-runner setup                  # re-run setup wizard anytime
```

To uninstall: `/hook-runner setup` then pass `--uninstall --confirm`.

> **Note:** Slash commands require installation first (`npx grobomo/hook-runner --yes`), which copies setup.js and all modules into the skill directory.

## Workflows

```
/hook-runner workflow               # list available workflows
/hook-runner audit                  # coverage report
```

Built-in: `starter` (safe defaults, 42 modules), `shtd` (spec-driven pipeline, 101 modules), `gsd` (phase-driven pipeline, 101 modules), `customer-data-guard`, `no-local-docker`, `cross-project-reset`.

## Workflow Templates

Create workflows from curated templates instead of empty scaffolds:

```
/hook-runner setup                  # then pass: --workflow templates
/hook-runner setup                  # then pass: --workflow create my-wf --from-template security
```

Templates: `security` (10 modules), `quality` (9), `lifecycle` (11), `minimal` (3).

## Workflow Groups

Each workflow YAML can declare `enabled: true/false`. Combined with `workflow-config.json` overrides, this gives layered control:

```
/hook-runner groups                 # see all groups with ON/OFF status
```

Priority: YAML `enabled:` field < global `workflow-config.json` < project `workflow-config.json`. Modules tagged with a disabled workflow are skipped. Untagged modules always run.

## Module Contract

```javascript
// WORKFLOW: shtd
// WHY: Explain the real incident that caused this module.
module.exports = function(input) {
  if (shouldBlock) return { decision: "block", reason: "WHY blocked" };
  return null; // pass
};
```

- Return `null` to pass, `{decision: "block"}` to block
- Sync or async (4s timeout for async)
- `// WORKFLOW: name` restricts to that workflow
- `// requires: mod1` for dependencies

## CLI

All commands are available as `/hook-runner <name>` slash commands (see custom_commands above). For advanced use, the full CLI:

```
/hook-runner setup                # setup wizard (--yes for non-interactive)
/hook-runner report               # HTML report
/hook-runner health               # verify installation
/hook-runner workflow             # workflow management
/hook-runner groups               # list workflow groups with status
/hook-runner stats                # hook activity summary
/hook-runner test                 # run all tests
/hook-runner demo                 # interactive demo (no install needed)
```
