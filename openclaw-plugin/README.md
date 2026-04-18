# hook-runner-gates (OpenClaw Plugin)

Ported [hook-runner](https://github.com/grobomo/hook-runner) gate modules for OpenClaw.

## Modules

| Module | What it does |
|---|---|
| `force-push-gate` | Blocks `git push --force` to main/master |
| `secret-scan-gate` | Blocks commits with API keys, tokens, private keys |
| `commit-quality-gate` | Blocks generic/short commit messages (min 5 words) |

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

Modules are enabled by default. Disable individual modules in `openclaw.plugin.json`:

```json
{
  "config": {
    "modules": {
      "force-push-gate": true,
      "secret-scan-gate": true,
      "commit-quality-gate": false
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
