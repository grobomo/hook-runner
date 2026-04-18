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
# Copy to OpenClaw plugins directory
cp -r openclaw-plugin ~/.openclaw/plugins/hook-runner-gates

# Restart OpenClaw to pick up the plugin
openclaw plugins list  # verify it appears
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
