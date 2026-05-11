#!/usr/bin/env bash
# Test T560: test-evidence PostToolUse + victory-declaration-gate integration
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: T560 test-evidence ==="

# Use a node helper to avoid Windows path escaping issues in bash
HELPER="$REPO_DIR/scripts/test/.t560-helper.js"
cat > "$HELPER" <<'JSEOF'
// Usage: node .t560-helper.js <action> [args...]
var fs = require("fs"), os = require("os"), path = require("path");
var REPO = path.resolve(__dirname, "../..");
var EV_MOD = path.join(REPO, "modules/PostToolUse/test-evidence.js");
var VG_MOD = path.join(REPO, "modules/PreToolUse/victory-declaration-gate.js");
var EV_FILE = path.join(os.tmpdir(), ".hook-runner-test-evidence.json");

function fresh(mod) { delete require.cache[require.resolve(mod)]; return require(mod); }

var action = process.argv[2];

if (action === "clean") {
  try { fs.unlinkSync(EV_FILE); } catch(e) {}
  console.log("cleaned");
}
else if (action === "exists") {
  console.log(fs.existsSync(EV_FILE) ? "yes" : "no");
}
else if (action === "read-counts") {
  var d = JSON.parse(fs.readFileSync(EV_FILE, "utf-8"));
  console.log(d.passed + "," + d.failed + (d.suites ? "," + d.suites : ""));
}
else if (action === "write-evidence") {
  // args: passed failed [age_ms]
  var p = parseInt(process.argv[3]), f = parseInt(process.argv[4]);
  var age = parseInt(process.argv[5] || "0");
  fs.writeFileSync(EV_FILE, JSON.stringify({
    ts: Date.now() - age, passed: p, failed: f, summary: p + " passed, " + f + " failed"
  }));
  console.log("written");
}
else if (action === "run-evidence") {
  // Simulate PostToolUse with test output
  var m = fresh(EV_MOD);
  var output = process.argv[3] || "";
  var r = m({tool_name: "Bash", tool_input: {command: "test"}, tool_result: output});
  console.log(r === null ? "null" : JSON.stringify(r));
}
else if (action === "run-evidence-skip") {
  var m = fresh(EV_MOD);
  var r = m({tool_name: "Read", tool_input: {}, tool_result: "10 passed, 0 failed"});
  console.log(r === null ? "null" : "not-null");
}
else if (action === "run-victory") {
  var m = fresh(VG_MOD);
  var msg = process.argv[3] || "All tests pass";
  var r = m({tool_name: "Bash", tool_input: {command: 'git commit -m "' + msg + '"'}});
  if (r && typeof r.then === "function") {
    r.then(function(v) { console.log(v === null ? "allowed" : "blocked"); });
  } else {
    console.log(r === null ? "allowed" : "blocked");
  }
}
else if (action === "run-victory-reason") {
  var m = fresh(VG_MOD);
  var msg = process.argv[3] || "All tests pass";
  var r = m({tool_name: "Bash", tool_input: {command: 'git commit -m "' + msg + '"'}});
  if (r && typeof r.then === "function") {
    r.then(function(v) { console.log(v ? v.reason : "no-reason"); });
  } else {
    console.log(r ? r.reason : "no-reason");
  }
}
JSEOF
trap 'rm -f "$HELPER"' EXIT

H="node $HELPER"

# --- test-evidence.js tests ---

# 1-3: Module structure
check "test-evidence exports function" '$H run-evidence "no test output" >/dev/null 2>&1'
check "test-evidence has WORKFLOW tag" 'head -3 "$REPO_DIR/modules/PostToolUse/test-evidence.js" | grep -q "WORKFLOW:"'
check "test-evidence has WHY comment" 'head -10 "$REPO_DIR/modules/PostToolUse/test-evidence.js" | grep -q "// WHY:"'

# 4. Skips non-Bash tools
OUT=$($H run-evidence-skip)
check "skips non-Bash tools" '[ "$OUT" = "null" ]'

# 5. Writes evidence on "N passed, 0 failed"
$H clean >/dev/null
$H run-evidence "=== Results: 14 passed, 0 failed ===" >/dev/null
OUT=$($H exists)
check "writes evidence on test pass" '[ "$OUT" = "yes" ]'

# 6. Correct counts
OUT=$($H read-counts)
check "evidence has correct counts (14,0)" '[ "$OUT" = "14,0" ]'

# 7. Suites format
$H clean >/dev/null
$H run-evidence "93 suites, 1344 passed, 2 failed" >/dev/null
OUT=$($H read-counts)
check "captures suites format (1344,2,93)" '[ "$OUT" = "1344,2,93" ]'

# 8. No evidence for non-test output
$H clean >/dev/null
$H run-evidence "On branch main, nothing to commit" >/dev/null
OUT=$($H exists)
check "no evidence for non-test output" '[ "$OUT" = "no" ]'

# 9. Never blocks
OUT=$($H run-evidence "10 passed, 0 failed")
check "never blocks (returns null)" '[ "$OUT" = "null" ]'

# --- victory-declaration-gate tests ---

# 10. Blocks victory words with no evidence
$H clean >/dev/null
OUT=$($H run-victory "All tests pass")
check "blocks victory words without evidence" '[ "$OUT" = "blocked" ]'

# 11. Block message mentions no evidence
OUT=$($H run-victory-reason "All tests pass")
check "block message mentions no evidence" 'echo "$OUT" | grep -q "NO TEST EVIDENCE"'

# 12. Allows with fresh 0-failure evidence
$H write-evidence 32 0 0 >/dev/null
OUT=$($H run-victory "All tests pass")
check "allows with fresh 0-failure evidence" '[ "$OUT" = "allowed" ]'

# 13. Blocks with evidence that has failures
$H write-evidence 30 2 0 >/dev/null
OUT=$($H run-victory "All tests pass")
check "blocks with failure evidence" '[ "$OUT" = "blocked" ]'

# 14. Block shows failure count
OUT=$($H run-victory-reason "All tests pass")
check "block message shows failures" 'echo "$OUT" | grep -q "has failures"'

# 15. Blocks with stale evidence (> 10 min)
$H write-evidence 32 0 700000 >/dev/null
OUT=$($H run-victory "All tests pass")
check "blocks with stale evidence (> 10 min)" '[ "$OUT" = "blocked" ]'

# 16. Allows non-victory commit
OUT=$($H run-victory "T560: add test evidence module")
check "allows non-victory commit" '[ "$OUT" = "allowed" ]'

# 17-19. Workflow presence
check "in starter workflow" 'grep -q "test-evidence" "$REPO_DIR/workflows/starter.yml"'
check "in shtd workflow" 'grep -q "test-evidence" "$REPO_DIR/workflows/shtd.yml"'
check "in gsd workflow" 'grep -q "test-evidence" "$REPO_DIR/workflows/gsd.yml"'

# 20. End-to-end: evidence module writes, victory gate reads
$H clean >/dev/null
$H run-evidence "=== Results: 20 passed, 0 failed ===" >/dev/null
OUT=$($H run-victory "All tests pass")
check "e2e: evidence write then victory gate allows" '[ "$OUT" = "allowed" ]'

$H clean >/dev/null

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
