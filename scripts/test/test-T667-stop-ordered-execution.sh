#!/usr/bin/env bash
# T667: Test ordered Stop execution (haiku → mechanical → background)
set -euo pipefail
cd "$(dirname "$0")/../.."

PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== hook-runner: Stop ordered execution (T667) ==="

# Setup temp dir for test modules
TMPDIR_RAW=$(mktemp -d)
TMPDIR="$(cd "$TMPDIR_RAW" && (pwd -W 2>/dev/null || pwd))"
trap 'rm -rf "$TMPDIR_RAW"' EXIT

STOP_DIR="$TMPDIR/Stop"
HAIKU_DIR="$STOP_DIR/1-haiku"
MECH_DIR="$STOP_DIR/2-mechanical"
mkdir -p "$HAIKU_DIR" "$MECH_DIR"

# --- Test 1: parseHaikuDecision extracts DONE ---
cat > "$TMPDIR/test-parse.js" << 'EOF'
var fs = require("fs");
var src = fs.readFileSync("run-stop.js", "utf-8");
var match = src.match(/function parseHaikuDecision[\s\S]*?^}/m);
if (!match) { process.stdout.write("NO_FUNC"); process.exit(0); }
eval(match[0]);
var tests = [
  ["SELF-CHECK [none]: DONE — All tasks complete", "DONE"],
  ["SELF-CHECK [todo-rule]: CONTINUE — Tasks remain", "CONTINUE"],
  ["SELF-CHECK [dispatch]: DISPATCH — Cross-project work", "DISPATCH"],
  ["SELF-CHECK [next-task]: NEXT — Next task available", "NEXT"],
  ["Random block message without marker", "UNKNOWN"],
  ["DONE — you may stop.", "DONE"],
  ["CONTINUE the session", "CONTINUE"],
];
var results = tests.map(function(t) { return parseHaikuDecision(t[0]) === t[1] ? "OK" : "FAIL:" + t[0] + "=" + parseHaikuDecision(t[0]); });
process.stdout.write(results.join(","));
EOF
PARSE_RESULT=$(node "$TMPDIR/test-parse.js" 2>/dev/null)
if echo "$PARSE_RESULT" | grep -q "FAIL"; then
  fail "parseHaikuDecision: $PARSE_RESULT"
else
  pass "parseHaikuDecision extracts DONE/CONTINUE/NEXT/DISPATCH correctly"
fi

# --- Test 2: New architecture triggers when 1-haiku/ exists ---
grep -q 'fs.existsSync(haikuDir)' run-stop.js && pass "run-stop.js checks for 1-haiku/ directory" || fail "Missing 1-haiku check"

# --- Test 3: Haiku modules loaded from 1-haiku/ ---
grep -q 'loadModules(haikuDir)' run-stop.js && pass "Haiku modules loaded from 1-haiku/ subdir" || fail "Missing haikuDir loading"

# --- Test 4: Mechanical modules only if DONE ---
grep -q 'haikuDecision === "DONE"' run-stop.js && pass "Mechanical gates conditional on DONE" || fail "Missing DONE check for mechanical"

# --- Test 5: Mechanical loaded from 2-mechanical/ ---
grep -q 'loadModules(mechDir)' run-stop.js && pass "Mechanical modules loaded from 2-mechanical/ subdir" || fail "Missing mechDir loading"

# --- Test 6: Background from top-level ---
grep -q 'loadModules(stopDir)' run-stop.js && pass "Background modules loaded from top-level Stop/" || fail "Missing top-level loading"

# --- Test 7: Always exit 1 (T759: stop hook must always be visible in TUI) ---
grep -q "process.exit(1)" run-stop.js && pass "New arch: always exit 1 (T759)" || fail "Missing exit 1 logic"

# --- Test 8: Legacy fallback when no 1-haiku/ ---
grep -q "LEGACY_BLOCKING" run-stop.js && pass "Legacy fallback preserved (LEGACY_BLOCKING array)" || fail "Missing legacy fallback"

# --- Test 9: Functional test — haiku DONE, no mechanical override ---
cat > "$HAIKU_DIR/test-haiku-gate.js" << 'EOF'
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: test haiku gate
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "SELF-CHECK [test]: DONE — All work complete.\nNo further action needed. You may stop." };
};
EOF

INPUT='{"stop_hook_active":false,"last_assistant_message":"I completed the task."}'
RESULT=$(echo "$INPUT" | HOOK_RUNNER_MODULES_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 CLAUDE_SESSION_ID=test1234 node run-stop.js 2>/dev/null || true)
if echo "$RESULT" | grep -q "DONE"; then
  pass "Haiku DONE flows through as block output"
else
  fail "Haiku DONE not in output: $RESULT"
fi

# --- Test 10: Functional test — haiku CONTINUE, mechanical skipped ---
cat > "$HAIKU_DIR/test-haiku-gate.js" << 'EOF'
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: test haiku gate
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "SELF-CHECK [todo]: CONTINUE — Tasks remain in TODO.md" };
};
EOF

MECH_MARKER="$TMPDIR/t667-mech-ran"
cat > "$MECH_DIR/test-mech-gate.js" << EOF
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: test mechanical gate
"use strict";
var fs = require("fs");
fs.writeFileSync("$MECH_MARKER", "yes");
module.exports = function(input) {
  return { decision: "block", reason: "MECHANICAL OVERRIDE" };
};
EOF
rm -f "$MECH_MARKER"

RESULT=$(echo "$INPUT" | HOOK_RUNNER_MODULES_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 CLAUDE_SESSION_ID=test1234 node run-stop.js 2>/dev/null || true)
if [ ! -f "$MECH_MARKER" ]; then
  pass "Mechanical gate skipped when haiku says CONTINUE"
else
  fail "Mechanical gate ran despite CONTINUE"
fi
if echo "$RESULT" | grep -q "CONTINUE"; then
  pass "CONTINUE block reason preserved in output"
else
  fail "CONTINUE not in output: $RESULT"
fi

# --- Test 11: Functional test — haiku DONE, mechanical overrides ---
cat > "$HAIKU_DIR/test-haiku-gate.js" << 'EOF'
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: test haiku gate
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "SELF-CHECK [none]: DONE — Work complete.\nNo further action needed. You may stop." };
};
EOF

RESULT=$(echo "$INPUT" | HOOK_RUNNER_MODULES_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 CLAUDE_SESSION_ID=test1234 node run-stop.js 2>/dev/null || true)
if [ -f "$MECH_MARKER" ]; then
  pass "Mechanical gate runs when haiku says DONE"
else
  fail "Mechanical gate did not run on DONE"
fi
if echo "$RESULT" | grep -q "MECHANICAL OVERRIDE"; then
  pass "Mechanical override takes precedence over DONE"
else
  fail "Mechanical override not in output: $RESULT"
fi
rm -f "$MECH_MARKER"

# --- Test 12: Both haiku blocks visible in stderr ---
cat > "$HAIKU_DIR/test-haiku-gate.js" << 'EOF'
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: test haiku gate
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "SELF-CHECK [rule1]: DONE — Complete.\nNo further action needed. You may stop." };
};
EOF
rm -f "$MECH_DIR/test-mech-gate.js"

STDERR=$(echo "$INPUT" | HOOK_RUNNER_MODULES_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 CLAUDE_SESSION_ID=test1234 node run-stop.js 2>&1 1>/dev/null || true)
if echo "$STDERR" | grep -q "test-haiku-gate"; then
  pass "Haiku gate block visible in stderr"
else
  fail "Haiku gate block not in stderr: $STDERR"
fi

# --- Test 13: stop-analysis-gate.js in 1-haiku/ has TOOLS tag ---
grep -q "// TOOLS: Stop" modules/Stop/1-haiku/stop-analysis-gate.js && pass "1-haiku/stop-analysis-gate.js has // TOOLS: tag" || fail "Missing TOOLS tag"

# --- Test 14: stop-analysis-gate.js always returns block (no null on stop) ---
grep -q 'reason: "SELF-CHECK.*DONE' modules/Stop/1-haiku/stop-analysis-gate.js && pass "stop-analysis-gate.js returns block on DONE (not null)" || fail "Still returns null on stop"

# --- Test 15: auto-continue-gate.js in 1-haiku/ returns block on DONE ---
grep -q 'reason: "SELF-CHECK.*DONE' modules/Stop/1-haiku/auto-continue-gate.js && pass "auto-continue-gate.js returns block on DONE" || fail "Missing DONE block"

# --- Test 16: _disabled modules have DISABLED comment ---
grep -q "DISABLED: T667" modules/Stop/_disabled/_auto-continue.js && pass "_disabled/_auto-continue.js marked as disabled" || fail "Missing DISABLED marker"
grep -q "DISABLED: T667" modules/Stop/_disabled/_never-give-up.js && pass "_disabled/_never-give-up.js marked as disabled" || fail "Missing DISABLED marker"

# --- Test 17: run-stop.js has runModule helper function ---
grep -q "function runModule" run-stop.js && pass "runModule helper extracted for DRY" || fail "Missing runModule helper"

# --- Test 18: Background modules don't include blocking ones ---
grep -q '!loadModules.isBlocking' run-stop.js && pass "Background excludes BLOCKING-tagged modules" || fail "Missing isBlocking filter for bg"

# --- T804: Decision priority order in code ---
grep -q 'DECISION_PRIORITY' run-stop.js && pass "T804: DECISION_PRIORITY map exists" || fail "Missing DECISION_PRIORITY"
grep -q '"CORRECT": 5' run-stop.js && pass "T804: CORRECT has highest priority (5)" || fail "CORRECT priority wrong"
grep -q '"CONTINUE": 4' run-stop.js && pass "T804: CONTINUE priority = 4" || fail "CONTINUE priority wrong"
grep -q '"DONE": 2' run-stop.js && pass "T804: DONE priority = 2 (lower than CONTINUE)" || fail "DONE priority wrong"

# --- T804: Conflict detection logic ---
grep -q 'allDecisions' run-stop.js && pass "T804: allDecisions array tracks all verdicts" || fail "Missing allDecisions"
grep -q 'hasConflict' run-stop.js && pass "T804: Conflict detection implemented" || fail "Missing conflict detection"
grep -q 'decision-conflict' run-stop.js && pass "T804: Conflict logged to hook-log" || fail "Missing conflict logging"

# --- T804: Functional conflict detection test ---
rm -f "$HAIKU_DIR"/*.js
cat > "$HAIKU_DIR/aaa-gate.js" << 'EOF'
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: test conflict — returns DONE
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "SELF-CHECK [rule-done]: DONE — you may stop." };
};
EOF
cat > "$HAIKU_DIR/bbb-gate.js" << 'EOF'
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: test conflict — returns CONTINUE
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "SELF-CHECK [rule-continue]: CONTINUE — Tasks remain." };
};
EOF
rm -f "$MECH_DIR"/*.js

STDERR_CONFLICT=$(echo "$INPUT" | HOOK_RUNNER_MODULES_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 CLAUDE_SESSION_ID=test1234 node run-stop.js 2>&1 1>/dev/null || true)
if echo "$STDERR_CONFLICT" | grep -q "decision-conflict"; then
  pass "T804: Conflict detected between DONE and CONTINUE"
else
  fail "T804: Conflict not detected: $STDERR_CONFLICT"
fi
if echo "$STDERR_CONFLICT" | grep -q "CONTINUE"; then
  pass "T804: CONTINUE wins over DONE"
else
  fail "T804: Winner not CONTINUE: $STDERR_CONFLICT"
fi

# --- T804: No conflict when rules agree ---
rm -f "$HAIKU_DIR"/*.js
cat > "$HAIKU_DIR/aaa-gate.js" << 'EOF'
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: test agree
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "SELF-CHECK [r1]: CONTINUE — keep going" };
};
EOF
cat > "$HAIKU_DIR/bbb-gate.js" << 'EOF'
// WORKFLOW: haiku-rules
// BLOCKING: true
// WHY: test agree
"use strict";
module.exports = function(input) {
  return { decision: "block", reason: "SELF-CHECK [r2]: CONTINUE — more work" };
};
EOF

STDERR_AGREE=$(echo "$INPUT" | HOOK_RUNNER_MODULES_DIR="$TMPDIR" HOOK_RUNNER_TEST=1 CLAUDE_SESSION_ID=test1234 node run-stop.js 2>&1 1>/dev/null || true)
if echo "$STDERR_AGREE" | grep -q "decision-conflict"; then
  fail "T804: False conflict detected when rules agree"
else
  pass "T804: No conflict when rules agree (both CONTINUE)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
