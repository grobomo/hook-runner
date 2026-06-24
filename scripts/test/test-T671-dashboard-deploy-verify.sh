#!/usr/bin/env bash
# T671+T672: Test dashboard-deploy-verify-gate and screenshot-public-site-gate
set -euo pipefail
cd "$(dirname "$0")/../.."

PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== hook-runner: Dashboard deploy verify (T671+T672) ==="

GATE_DIR="modules/Stop/2-mechanical/llm-token-tracker"

# --- Structural tests ---
[ -f "$GATE_DIR/dashboard-deploy-verify-gate.js" ] && pass "T671 gate exists" || fail "T671 gate missing"
[ -f "$GATE_DIR/screenshot-public-site-gate.js" ] && pass "T672 gate exists" || fail "T672 gate missing"

grep -q "// TOOLS: Stop" "$GATE_DIR/dashboard-deploy-verify-gate.js" && pass "T671 has TOOLS tag" || fail "T671 missing TOOLS"
grep -q "// BLOCKING: true" "$GATE_DIR/dashboard-deploy-verify-gate.js" && pass "T671 has BLOCKING tag" || fail "T671 missing BLOCKING"
grep -q "// WHY:" "$GATE_DIR/dashboard-deploy-verify-gate.js" && pass "T671 has WHY comment" || fail "T671 missing WHY"
grep -q "_log(" "$GATE_DIR/dashboard-deploy-verify-gate.js" && pass "T671 has logging" || fail "T671 missing logging"
grep -q "INCIDENT HISTORY" "$GATE_DIR/dashboard-deploy-verify-gate.js" && pass "T671 has incident history" || fail "T671 missing incident"

grep -q "// TOOLS: Stop" "$GATE_DIR/screenshot-public-site-gate.js" && pass "T672 has TOOLS tag" || fail "T672 missing TOOLS"
grep -q "// BLOCKING: true" "$GATE_DIR/screenshot-public-site-gate.js" && pass "T672 has BLOCKING tag" || fail "T672 missing BLOCKING"
grep -q "_log(" "$GATE_DIR/screenshot-public-site-gate.js" && pass "T672 has logging" || fail "T672 missing logging"

# --- Functional tests ---
TMPDIR_RAW=$(mktemp -d)
TMPDIR="$(cd "$TMPDIR_RAW" && (pwd -W 2>/dev/null || pwd))"
trap 'rm -rf "$TMPDIR_RAW"' EXIT
PROJ_DIR="$TMPDIR/llm-token-tracker"
mkdir -p "$PROJ_DIR"

# Create a fake transcript dir
SLUG=$(echo "$PROJ_DIR" | sed 's/[^a-zA-Z0-9-]/-/g')
LOGS_DIR="$HOME/.claude/projects/$SLUG"
mkdir -p "$LOGS_DIR"

# --- T671 Test: Skips for non-llm-token-tracker ---
RESULT=$(CLAUDE_PROJECT_DIR="/tmp/other-project" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE_DIR/dashboard-deploy-verify-gate.js');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "T671 skips non-llm-token-tracker project" || fail "T671 didn't skip: $RESULT"

# --- T671 Test: Passes when no dashboard edits ---
echo '{"type":"tool_use","tool":"Bash","input":{"command":"echo hello"}}' > "$LOGS_DIR/test.jsonl"
RESULT=$(CLAUDE_PROJECT_DIR="$PROJ_DIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE_DIR/dashboard-deploy-verify-gate.js');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "T671 passes when no dashboard edits" || fail "T671 blocked without edits: $RESULT"

# --- T671 Test: Blocks when dashboard edited but not deployed ---
echo '{"type":"tool_use","tool":"Edit","input":{"file_path":"/home/user/llm-token-tracker/dashboard/index.html"}}' > "$LOGS_DIR/test.jsonl"
RESULT=$(CLAUDE_PROJECT_DIR="$PROJ_DIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE_DIR/dashboard-deploy-verify-gate.js');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "block" ] && pass "T671 blocks dashboard edits without deploy" || fail "T671 didn't block: $RESULT"

# --- T671 Test: Passes when fully deployed ---
cat > "$LOGS_DIR/test.jsonl" << 'EOF'
{"type":"tool_use","tool":"Edit","input":{"file_path":"/home/user/llm-token-tracker/dashboard/index.html"}}
{"type":"tool_use","tool":"Bash","input":{"command":"aws s3 cp dashboard/ s3://tokentracker-data/dashboard/ --recursive"}}
{"type":"tool_use","tool":"Bash","input":{"command":"aws cloudfront create-invalidation --distribution-id EXXX --paths /*"}}
{"type":"tool_result","content":"browser_take_screenshot of tokentracker.click done"}
EOF
RESULT=$(CLAUDE_PROJECT_DIR="$PROJ_DIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE_DIR/dashboard-deploy-verify-gate.js');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T671 passes with full deploy evidence" || fail "T671 blocked despite evidence: $RESULT"

# --- T671 Test: Lists missing steps ---
echo '{"type":"tool_use","tool":"Edit","input":{"file_path":"/home/user/llm-token-tracker/dashboard/app.js"}}
{"type":"tool_use","tool":"Bash","input":{"command":"aws s3 cp dashboard/ s3://tokentracker-data/ --recursive"}}' > "$LOGS_DIR/test.jsonl"
RESULT=$(CLAUDE_PROJECT_DIR="$PROJ_DIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE_DIR/dashboard-deploy-verify-gate.js');
  var r = gate({});
  process.stdout.write(r ? r.reason : 'null');
")
echo "$RESULT" | grep -q "CloudFront" && pass "T671 lists missing CloudFront" || fail "T671 missing step not listed"
echo "$RESULT" | grep -q "screenshot" && pass "T671 lists missing screenshot" || fail "T671 screenshot not listed"

# --- T672 Test: Skips for non-llm-token-tracker ---
RESULT=$(CLAUDE_PROJECT_DIR="/tmp/other-project" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE_DIR/screenshot-public-site-gate.js');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "T672 skips non-llm-token-tracker project" || fail "T672 didn't skip"

# --- T672 Test: Passes when no frontend edits ---
echo '{"type":"tool_use","tool":"Bash","input":{"command":"echo hello"}}' > "$LOGS_DIR/test.jsonl"
RESULT=$(CLAUDE_PROJECT_DIR="$PROJ_DIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE_DIR/screenshot-public-site-gate.js');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T672 passes when no frontend edits" || fail "T672 blocked without edits"

# --- T672 Test: Blocks when frontend edited with public URL but no screenshot ---
cat > "$LOGS_DIR/test.jsonl" << 'EOF'
{"type":"tool_use","tool":"Edit","input":{"file_path":"/home/user/llm-token-tracker/dashboard/style.css"}}
{"type":"tool_use","tool":"Bash","input":{"command":"aws s3 cp dashboard/ s3://tokentracker/"}}
EOF
RESULT=$(CLAUDE_PROJECT_DIR="$PROJ_DIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE_DIR/screenshot-public-site-gate.js');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "block" ] && pass "T672 blocks frontend edits without screenshot" || fail "T672 didn't block: $RESULT"

# --- T672 Test: Passes when screenshot taken ---
cat > "$LOGS_DIR/test.jsonl" << 'EOF'
{"type":"tool_use","tool":"Edit","input":{"file_path":"/home/user/llm-token-tracker/dashboard/style.css"}}
{"type":"tool_use","tool":"Bash","input":{"command":"aws s3 cp dashboard/ s3://tokentracker/"}}
{"type":"tool_result","content":"browser_take_screenshot saved to /tmp/dash-verify.png"}
EOF
RESULT=$(CLAUDE_PROJECT_DIR="$PROJ_DIR" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$GATE_DIR/screenshot-public-site-gate.js');
  var r = gate({});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T672 passes with screenshot evidence" || fail "T672 blocked despite screenshot"

# Cleanup test logs dir
rm -rf "$LOGS_DIR"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
