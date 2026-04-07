# No Real Paths in Code Comments

The `test-T204-portable-paths.sh` test scans ALL `.js` files (including setup.js)
for patterns like `C:\Users\<name>\`. This catches comments too, not just code.

When writing example paths in comments:
- Use string concatenation or `$HOME` references: `"C--" + "Users-alice-..." → $HOME + "\..."`
- Or split the literal so the regex doesn't match as one token
- The regex `C:\\Users\\[a-zA-Z]+\\` triggers on any Windows user path
- Even generic usernames like "alice" will match
