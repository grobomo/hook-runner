# No Real Paths in Code Comments

The `test-T204-portable-paths.sh` test scans ALL `.js` files (including setup.js)
for patterns like `C:\Users\<name>\`. This catches comments too, not just code.

When writing example paths in comments:
- Use `X:\home\dev\projects\my-app` instead of `C:\Users\alice\Projects\...`
- The regex `C:\\Users\\[a-zA-Z]+\\` triggers on any Windows user path
- Even generic usernames like "alice" will match

This wasted time twice: first with "joelg" (real), then with "alice" (generic).
