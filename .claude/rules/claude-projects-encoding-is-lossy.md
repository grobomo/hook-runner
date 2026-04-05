# .claude/projects/ Dir Encoding is Lossy

The encoded dir names in `~/.claude/projects/` replace `\`, `/`, `:`, and `.`
ALL with `-`. This means decoding is ambiguous:

- `hook-runner` → is the `-` a path separator or a literal hyphen?
- `.claude` → encoded as `-claude`, making `joelg\.claude` → `joelg--claude`
- The first `--` is always drive letter (`C:`)

Use `decodeProjectDir()` in setup.js which does greedy filesystem-aware decode.
Never use simple regex replacement (`--` → `:\`, `-` → `\`) — it breaks on
hyphenated names and dot-prefix directories.
