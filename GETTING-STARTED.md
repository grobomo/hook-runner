# Getting Started with hook-runner

Get from zero to enforced guardrails in 5 minutes. For the full reference, see [README.md](README.md).

## 1. Install (30 seconds)

```bash
npx grobomo/hook-runner --yes
```

This backs up your existing hooks, installs the runner system, and enables the **starter** workflow (46 modules covering the most common mistakes).

To preview first without changing anything:
```bash
npx grobomo/hook-runner --demo
```

## 2. See it work

Start a Claude Code session. Try something the starter workflow blocks:

- Ask Claude to `git push --force origin main` — force-push-gate blocks it
- Ask Claude to `git reset --hard` — git-destructive-guard blocks it
- Commit with a vague message like `git commit -m "fix"` — commit-quality-gate blocks it

Claude sees the block reason inline and adjusts its approach. You don't need to do anything.

## 3. Write your first module (2 minutes)

Create a file in the modules folder:

```bash
cat > ~/.claude/hooks/run-modules/PreToolUse/no-rm-rf.js << 'EOF'
// WORKFLOW: starter
// WHY: Accidentally ran rm -rf on a project directory.
module.exports = function(input) {
  if (input.tool_name !== "Bash") return null;
  var cmd = (input.tool_input || {}).command || "";
  if (/rm\s+-rf/.test(cmd)) {
    return { decision: "block", reason: "Blocked rm -rf. Use archive/ or trash instead." };
  }
  return null;
};
EOF
```

That's it. No config files to edit. The runner auto-discovers `.js` files in the folder.

**Module rules:**
- Return `null` to allow, `{decision: "block", reason: "..."}` to block
- Add `// WORKFLOW: name` so it only runs when that workflow is active
- Add `// WHY: ...` to explain what incident caused this module

## 4. Pick your workflow

Workflows group modules into pipelines. Start with one:

| Workflow | Best for | What it does |
|----------|----------|-------------|
| `starter` | Everyone | Blocks common mistakes (force-push, destructive git, secrets, bad commits). Already enabled. |
| `shtd` | Solo devs | Full spec-first pipeline. Enforces: write spec, create branch, write tests, implement, PR. |
| `gsd` | Project teams | Phase-based flow with ROADMAP.md, parallel workstreams, milestone tracking. |
| `customer-data-guard` | Incident response | Read-only mode. Blocks env changes and data exfiltration. |

```bash
# See all workflows
node setup.js --workflow list

# Enable the full development pipeline
node setup.js --workflow enable shtd

# Disable it later
node setup.js --workflow disable shtd
```

## 5. Day-to-day commands

```bash
node setup.js --health            # is everything working?
node setup.js --diagnose          # something broken? start here
node setup.js --list --why        # browse modules with descriptions
node setup.js --test-module NAME  # test a module against sample inputs
node setup.js --stats             # what are my hooks doing?
node setup.js --report --open     # visual HTML overview
node setup.js --perf              # which modules are slow?
```

## Uninstall

```bash
node setup.js --uninstall --confirm
```

Restores your original `settings.json` from the backup created during install.

## Next steps

- Browse the [full module catalog](README.md#available-modules) (120+ modules)
- Read about [custom workflows](README.md#custom-workflows)
- Check the [architecture](README.md#architecture) to understand how runners and modules connect
- Run `node setup.js --help` for all CLI commands
