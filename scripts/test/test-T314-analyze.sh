#!/usr/bin/env bash
# Test T314: --analyze report generation (local heuristic analysis)
# WHY: The analyze feature adds quality scoring, coverage gaps, DRY detection,
# and performance analysis to the HTML report. Must verify it generates valid output.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: analyze report tests ==="

# Test 1: --analyze generates report with analysis section
OUT=$(cd "$REPO_DIR" && node setup.js --analyze 2>&1)
check "analyze runs without error" 'echo "$OUT" | grep -q "Running local analysis"'

REPORT="$HOME/.claude/reports/hooks-report-before.html"
check "report file exists" '[ -f "$REPORT" ]'
check "report has analysis section" 'grep -q "analysis-section" "$REPORT"'
check "report has quality score" 'grep -q "System Analysis" "$REPORT"'
check "report has recommendations" 'grep -q "Top Recommendations" "$REPORT"'

# Test 2: --analyze --input merges external JSON
TMPJSON=$(mktemp)
cat > "$TMPJSON" << 'ENDJSON'
{"quality":{"score":"B","summary":"Test analysis"},"coverage_gaps":["test gap"],"dry_issues":[],"performance":[],"redundant_modules":[],"missing_modules":[],"top_recommendations":["test rec"]}
ENDJSON

OUT2=$(cd "$REPO_DIR" && node setup.js --analyze --input "$TMPJSON" 2>&1)
check "input mode loads file" 'echo "$OUT2" | grep -q "Loaded LLM analysis"'
check "merged report has LLM quality" 'grep -q "Test analysis" "$REPORT"'
check "merged report has LLM recommendation" 'grep -q "test rec" "$REPORT"'

rm -f "$TMPJSON"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
