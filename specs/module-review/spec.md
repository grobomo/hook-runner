# Module Review Dashboard

## Problem
With 84+ modules across 5 events, it's hard to know what each module does, whether it's earning its keep, or if it's stale. There's no single view to review all modules, sort by activity, and identify candidates for removal or consolidation.

## Solution
Add a "Module Review" section to the HTML report (`--report`) with a sortable table showing every module's:
- Name, event, workflow
- WHY summary (the incident that created it)
- Block count, total calls, block rate
- Avg latency (ms)
- Last blocked date
- Verdict: active (blocks regularly), preventive (many calls, 0 blocks — learned deterrent), stale (no calls in 30+ days), dead (0 calls ever)

## Design
- Inserted between the flow diagram and the per-event detail cards
- Sortable by clicking column headers (client-side JS)
- Color-coded verdict badges
- Extends existing `parseLogLines()` to track `lastBlockTs`, `firstTs`, `lastTs`
- No new CLI flags — always shown when `--report` is run

## Success Criteria
- Table renders all installed modules with correct stats
- Sorting works on all columns
- Verdict classification is accurate
- Report still loads fast (<2s)
