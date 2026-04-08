# Stop Runner: Run All Modules

## Problem
The Stop runner (`run-stop.js`) calls `process.exit(0)` immediately when any module returns `{decision: "block"}`. Since `auto-continue.js` loads first (alphabetical) and always blocks, all subsequent Stop modules (self-reflection, drift-review, mark-turn-complete, etc.) never execute. The hook log confirms: only `auto-continue` has any calls logged for Stop events.

## Solution
Change the Stop runner to run ALL modules before exiting. Collect the first block result, continue running remaining modules, then output the collected block and exit. This matches how Stop modules are designed — they're observational/cleanup, not gates.

## Scope
- `run-stop.js` — change exit-on-first-block to collect-and-continue
- Add test verifying all Stop modules run even when one blocks early
