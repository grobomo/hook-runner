# hook-runner-gates (OpenClaw Plugin)

Ported [hook-runner](https://github.com/grobomo/hook-runner) gate modules for OpenClaw.

## Modules

### before_tool_call (13 gates)

| Module | What it does |
|---|---|
| `force-push-gate` | Blocks `git push --force` to main/master |
| `secret-scan-gate` | Blocks commits with API keys, tokens, private keys |
| `commit-quality-gate` | Blocks generic/short commit messages (min 5 words) |
| `git-destructive-guard` | Blocks `git reset --hard`, `git checkout .`, `git clean -f` |
| `archive-not-delete` | Blocks `rm -rf` and destructive deletes — use archive/ instead |
| `git-rebase-safety` | Warns about --ours/--theirs reversal during rebase |
| `no-hardcoded-paths` | Blocks hardcoded absolute paths (C:\Users\..., /home/...) in code |
| `victory-declaration-gate` | Blocks premature "all tests pass" claims in commit messages |
| `root-cause-gate` | Blocks cleanup commands without root cause diagnosis |
| `no-fragile-heuristics` | Blocks pixel/color threshold code in verification scripts |
| `no-focus-steal` | Blocks background processes that flash console windows (Windows) |
| `crlf-ssh-key-check` | Warns about CRLF corruption when copying SSH keys |
| `unresolved-issues-gate` | Blocks commit when TODO.md has unresolved FAIL/WARN entries |

### after_tool_call (5 gates)

| Module | What it does |
|---|---|
| `commit-msg-check` | Warns on WIP/fixup prefixes and long first lines in commits |
| `crlf-detector` | Detects CRLF line endings in .sh, .yml, .py, .env files |
| `test-coverage-check` | Reminds to run tests when source files with matching test files are modified |
| `result-review-gate` | Injects review checklist when reading report/results files |
| `rule-hygiene` | Validates rule files are granular and properly scoped |

## Install

```bash
# Option 1: Use the install script
bash openclaw-plugin/install.sh

# Option 2: Manual copy to OpenClaw extensions directory
cp -r openclaw-plugin ~/.openclaw/extensions/hook-runner-gates

# Option 3: Install to a named profile
OPENCLAW_HOME=~/.openclaw-myprofile bash openclaw-plugin/install.sh

# Verify it appears
openclaw plugins list
```

## Configuration

All modules are enabled by default. Disable individual modules in `openclaw.plugin.json`:

```json
{
  "config": {
    "modules": {
      "force-push-gate": true,
      "secret-scan-gate": true,
      "no-focus-steal": false
    }
  }
}
```

## Porting from hook-runner

This plugin demonstrates the conversion pattern from hook-runner's CommonJS modules
to OpenClaw's Plugin SDK:

| Hook-Runner | OpenClaw Plugin SDK |
|---|---|
| `module.exports = function(input)` | `before_tool_call(input: ToolCallInput)` |
| `input.tool_name` | `input.tool` |
| `input.tool_input.command` | `input.args.command` |
| `return null` (pass) | `return { action: "allow" }` |
| `return { decision: "block", reason }` | `return { action: "deny", reason }` |

See [docs/T472-openclaw-mapping.md](../docs/T472-openclaw-mapping.md) for the full
module mapping (94 modules, 70% portable).
