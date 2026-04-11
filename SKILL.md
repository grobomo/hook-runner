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
  - starter
custom_commands:
  - name: setup
    command: "node $SKILL_DIR/setup.js"
    description: "Run setup wizard — scan, report, backup, install"
  - name: report
    command: "node $SKILL_DIR/setup.js --report --open"
    description: "Generate and open HTML hooks report"
  - name: health
    command: "node $SKILL_DIR/setup.js --health"
    description: "Verify runners, modules, and settings"
  - name: workflow
    command: "node $SKILL_DIR/setup.js --workflow list"
    description: "List workflows with enabled state"
  - name: audit
    command: "node $SKILL_DIR/setup.js --workflow audit"
    description: "Audit workflow coverage and orphan modules"
  - name: stats
    command: "node $SKILL_DIR/setup.js --stats"
    description: "Quick text summary of hook activity"
  - name: test
    command: "node $SKILL_DIR/setup.js --test"
    description: "Run all test suites"
---

# hook-runner

Modular hook runner for Claude Code. Workflows group related modules into enforceable pipelines. Enable a workflow and its modules activate together.

## Quick Start

```
npx grobomo/hook-runner --yes    # install + enable default workflows
node setup.js --uninstall --confirm  # clean removal, restore original settings
```

## Workflows

```
/hook-runner workflow              # list available workflows
node setup.js --workflow enable shtd --global
node setup.js --workflow audit     # coverage report
node setup.js --workflow query Edit  # which workflows affect Edit?
```

Built-in: `starter` (safe defaults, 11 modules), `shtd` (full development pipeline, 90 modules), `customer-data-guard`, `no-local-docker`, `cross-project-reset`.

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
- `// WORKFLOW: name` restricts to that workflow (multi: `// WORKFLOW: shtd, starter`)
- `// requires: mod1` for dependencies

## CLI

```
node setup.js                     # setup wizard
node setup.js --yes               # non-interactive + default workflows
node setup.js --report [--open]   # HTML report
node setup.js --health            # verify installation
node setup.js --list              # catalog vs installed
node setup.js --sync              # sync from GitHub
node setup.js --stats             # hook activity summary
node setup.js --perf              # timing analysis
node setup.js --workflow <cmd>    # workflow management
node setup.js --test              # run all tests
node setup.js --uninstall --confirm  # restore original settings
```
