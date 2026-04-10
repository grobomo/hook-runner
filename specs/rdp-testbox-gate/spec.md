# T398: rdp-testbox-gate module (ddei-email-security PreToolUse)

## Problem
Claude wasted a full session reinventing RDP connection logic that already worked in `start-e2e-test.sh` (commit 21e5b3d). Module was deployed to live but without specs or tests.

## Solution
Add spec and test suite for the existing `modules/PreToolUse/ddei-email-security/rdp-testbox-gate.js`.

## Behavior
- **Triggers on**: `Bash` tool with RDP-related commands (mstsc, cmdkey, testbox-rdp, testbox-create, testbox-destroy, or bare "rdp" in command context)
- **Allows**: read-only git/cat/grep commands referencing files with "rdp" in name (T396 fix)
- **Allows**: joel-scripts/ commands (user's own scripts)
- **Blocks with reminder**: RDP connection/creation commands with the proven pattern from start-e2e-test.sh

## Test Cases
1. Non-Bash tool → pass
2. `git status rdp-testbox-gate.js` → pass (read-only git)
3. `git add rdp-testbox-gate.js` → pass (read-only git)
4. `cat rdp-testbox-gate.js` → pass (read-only command)
5. `mstsc /v:10.0.0.1` → block
6. `cmdkey /generic:TERMSRV/10.0.0.1` → block
7. `powershell -Command "Start-Process mstsc"` → pass (no rdp keyword directly, but mstsc is there) → block
8. `joel-scripts/testbox-rdp.sh` → pass (joel-scripts allowed)
9. Block message mentions proven pattern
10. Block message mentions two servers (ddei-testbox vs ddei-tester)

## Files
- `modules/PreToolUse/ddei-email-security/rdp-testbox-gate.js` — already in catalog (T396)
- `scripts/test/test-rdp-testbox-gate.js` — new test suite
