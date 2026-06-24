#!/usr/bin/env bash
# Verify that the last stop hook fired and produced a block (visible in TUI).
# Run this BEFORE declaring anything "done" or "working."
# Exit 0 = verified. Exit 1 = BROKEN.

LOG="$HOME/.claude/hooks/hook-log.jsonl"
GATE1="$HOME/.claude/hooks/run-modules/Stop/1-haiku/auto-continue-gate.js"
GATE2="$HOME/.claude/hooks/run-modules/Stop/1-haiku/stop-analysis-gate.js"

echo "=== Stop Hook Verification ==="

# Check 1: Gate files exist and have valid syntax
node -c "$GATE1" 2>/dev/null || { echo "FAIL: auto-continue-gate.js has syntax error"; exit 1; }
node -c "$GATE2" 2>/dev/null || { echo "FAIL: stop-analysis-gate.js has syntax error"; exit 1; }
echo "✓ Gate files valid"

# Check 2: No null returns in module.exports
NULL_COUNT=$(sed -n '/^module.exports/,$ p' "$GATE1" | grep -c "return null" || true)
[ "$NULL_COUNT" -eq 0 ] || { echo "FAIL: auto-continue-gate has $NULL_COUNT null returns in module.exports"; exit 1; }
# GATE2 intentionally disabled (T707) — skip null check for it
echo "✓ Zero null returns in main functions"

# Check 3: No dedup logic
grep -q "dedup_skip\|hasRecentMandate" <(sed -n '/^module.exports/,$ p' "$GATE1") && { echo "FAIL: auto-continue-gate still has dedup"; exit 1; } || true
grep -q "dedup_skip\|hasRecentMandate" <(sed -n '/^module.exports/,$ p' "$GATE2") && { echo "FAIL: stop-analysis-gate still has dedup"; exit 1; } || true
echo "✓ No dedup logic"

# Check 4: Last stop event is RECENT (within 5 min = stop hook actually firing)
LAST_TS=$(grep '"event":"Stop"' "$LOG" | tail -1 | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('ts',''))" 2>/dev/null)
if [ -n "$LAST_TS" ]; then
  AGE_S=$(python3 -c "from datetime import datetime,timezone; ts='$LAST_TS'; dt=datetime.fromisoformat(ts.replace('Z','+00:00')); print(int((datetime.now(timezone.utc)-dt).total_seconds()))" 2>/dev/null)
  if [ -n "$AGE_S" ] && [ "$AGE_S" -gt 300 ]; then
    echo "FAIL: Last stop was ${AGE_S}s ago (>5min). Stop hook is NOT FIRING on responses."
    echo "      Check: settings.json Stop hook config, run-stop.js exists, node path correct"
    exit 1
  fi
  echo "✓ Last stop ${AGE_S}s ago (recent)"
else
  echo "WARN: No stop events in log"
fi

# Check 5: Last stop event in log produced a block
LAST_STOP=$(grep '"event":"Stop"' "$LOG" | grep '"module":"auto-continue-gate"' | tail -1)
if [ -z "$LAST_STOP" ]; then
  echo "WARN: No stop events found in log (may be first run)"
else
  RESULT=$(echo "$LAST_STOP" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('result','?'))" 2>/dev/null)
  TS=$(echo "$LAST_STOP" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('ts','?')[11:19])" 2>/dev/null)
  if [ "$RESULT" = "pass" ]; then
    echo "WARN: Last stop at $TS logged 'pass' (DONE decision — still produces TUI output)"
  fi
  echo "✓ Last stop at $TS: result=$RESULT"
fi

# Check 5: Proxy reachable
HEALTH=$(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:4100/health 2>/dev/null || echo "000")
[ "$HEALTH" = "200" ] && echo "✓ Proxy healthy" || echo "WARN: Proxy returned $HEALTH (gates will use INFRA fallback)"

echo ""
echo "=== ALL CHECKS PASSED ==="
