#!/usr/bin/env bash
# T662+T663: Test portal-verify-gate and portal-evidence-recorder
set -euo pipefail
cd "$(dirname "$0")/../.."

PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== hook-runner: Portal verify + evidence (T662+T663) ==="

VERIFY_GATE="modules/PreToolUse/portal-verify-gate.js"
RECORDER="modules/PostToolUse/portal-evidence-recorder-gate.js"
EVIDENCE_RAW="${TMPDIR:-/tmp}/.hook-runner-portal-evidence-test-$$.json"
mkdir -p "$(dirname "$EVIDENCE_RAW")"
EVIDENCE="$(cd "$(dirname "$EVIDENCE_RAW")" && (pwd -W 2>/dev/null || pwd))/$(basename "$EVIDENCE_RAW")"
trap 'rm -f "$EVIDENCE_RAW" "$EVIDENCE"' EXIT

# --- Structural tests ---
[ -f "$VERIFY_GATE" ] && pass "T662 gate exists" || fail "T662 missing"
[ -f "$RECORDER" ] && pass "T663 recorder exists" || fail "T663 missing"

grep -q "// TOOLS: Edit, Write" "$VERIFY_GATE" && pass "T662 TOOLS tag" || fail "T662 missing TOOLS"
grep -q "// WHY:" "$VERIFY_GATE" && pass "T662 WHY comment" || fail "T662 missing WHY"
grep -q "_log(" "$VERIFY_GATE" && pass "T662 has logging" || fail "T662 missing logging"
grep -q "INCIDENT HISTORY" "$VERIFY_GATE" && pass "T662 has incident" || fail "T662 missing incident"

grep -q "// TOOLS: mcp__mcp-manager__mcpm" "$RECORDER" && pass "T663 TOOLS tag" || fail "T663 missing TOOLS"
grep -q "// WHY:" "$RECORDER" && pass "T663 WHY comment" || fail "T663 missing WHY"
grep -q "_log(" "$RECORDER" && pass "T663 has logging" || fail "T663 missing logging"

# --- T662 Functional tests ---

# Test: skips non-Edit/Write
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var r = gate({tool_name:'Bash', tool_input:{command:'echo hi'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T662 skips Bash" || fail "T662 didn't skip Bash: $RESULT"

# Test: skips non-TODO.md files
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/home/user/README.md', new_string:'[x] T205d validated'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T662 skips non-TODO files" || fail "T662 didn't skip: $RESULT"

# Test: skips non-cost-validation edits to TODO.md
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', new_string:'[x] T100 Fixed bug'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T662 skips non-cost edits" || fail "T662 blocked non-cost edit: $RESULT"

# Test: blocks cost validation without evidence
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', new_string:'[x] T205d cost validated in portal'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "block" ] && pass "T662 blocks cost validation without evidence" || fail "T662 didn't block: $RESULT"

# Test: blocks on 'reconcil' marker
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', new_string:'- [x] Reconciliation confirmed'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "block" ] && pass "T662 blocks reconciliation without evidence" || fail "T662 didn't block reconcil: $RESULT"

# Test: passes with evidence file
echo '[{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","url":"https://portal.rdsec.trendmicro.com/billing","session_id":"unknown"}]' > "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', new_string:'[x] T205d cost validated'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T662 passes with portal evidence" || fail "T662 blocked despite evidence: $RESULT"

# Test: fails with expired evidence
echo '[{"ts":"2020-01-01T00:00:00Z","url":"https://portal.rdsec.trendmicro.com/billing","session_id":"unknown"}]' > "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', new_string:'[x] T205d cost validated'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "block" ] && pass "T662 blocks with expired evidence" || fail "T662 passed expired: $RESULT"

# --- T730: False positive fix (per-line check) ---

# Test: does NOT block when [x] and cost keyword are on DIFFERENT lines
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var content = '- [x] T100 Fixed unrelated bug\n- [ ] T729: no-local-dashboard-gate.js — Blocks curl to portal data\n- [ ] T730: Fix portal-verify-gate false positive';
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', new_string: content}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T730 passes when [x] and cost on different lines" || fail "T730 false positive: $RESULT"

# Test: does NOT block when [x] on line 1 and portal mentioned on another line
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var content = '- [x] T555 Deploy complete\n\n- [ ] T662: portal-verify-gate.js — Blocks cost validation without portal evidence';
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', new_string: content}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T730 passes [x] and portal on separate lines" || fail "T730 false positive portal: $RESULT"

# Test: STILL blocks when same line has both cost and completion markers
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', new_string:'- [x] T205d cost validated and reconciled'}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "block" ] && pass "T730 still blocks same-line cost+completion" || fail "T730 missed: $RESULT"

# Test: does NOT block new spec text mentioning portal even if edit also has [x]
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var content = '- [x] T729: no-local-dashboard-gate created\n\n- [ ] T730: Fix portal-verify-gate.js false positive — Gate checks content for portal match';
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', new_string: content}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T730 passes spec text mentioning portal" || fail "T730 false positive spec: $RESULT"

# --- T848: Append after completed cost task ---

# Test: does NOT block when appending new TODO after a completed cost validation line
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var old_str = '- [x] T205d cost validated\n\n## Next';
  var new_str = '- [x] T205d cost validated\n\n- [ ] T900: New unrelated task\n\n## Next';
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', old_string: old_str, new_string: new_str}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T848 passes append after completed cost task" || fail "T848 false positive on append: $RESULT"

# Test: STILL blocks when Edit changes unchecked to checked cost task
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var old_str = '- [ ] T205d cost validation pending';
  var new_str = '- [x] T205d cost validated';
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', old_string: old_str, new_string: new_str}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "block" ] && pass "T848 still blocks unchecked-to-checked cost edit" || fail "T848 missed real completion: $RESULT"

# Test: does NOT block when old_string already had the completed reconciliation
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$VERIFY_GATE');
  var old_str = '- [x] Reconciliation confirmed\n## Done';
  var new_str = '- [x] Reconciliation confirmed\n- [ ] T999 New task\n## Done';
  var r = gate({tool_name:'Edit', tool_input:{file_path:'/project/TODO.md', old_string: old_str, new_string: new_str}});
  process.stdout.write(r === null ? 'null' : r.decision);
")
[ "$RESULT" = "null" ] && pass "T848 passes append after reconciliation" || fail "T848 false positive reconcil append: $RESULT"

# --- T663 Functional tests ---

# Test: skips non-MCP tool calls
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$RECORDER');
  var r = gate({tool_name:'Bash', tool_input:{command:'echo'}});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "T663 skips non-MCP" || fail "T663 didn't skip: $RESULT"

# Test: skips non-browser tools
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$RECORDER');
  var r = gate({tool_name:'mcp__mcp-manager__mcpm', tool_input:{tool:'list_servers'}});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "T663 skips non-browser MCP" || fail "T663 didn't skip: $RESULT"

# Test: skips non-portal URLs
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$RECORDER');
  var r = gate({tool_name:'mcp__mcp-manager__mcpm', tool_input:{tool:'browser_navigate', arguments:{url:'https://google.com'}}});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "T663 skips non-portal URLs" || fail "T663 didn't skip: $RESULT"
[ ! -f "$EVIDENCE" ] && pass "T663 no evidence for non-portal" || fail "T663 wrote evidence for non-portal"

# Test: records portal navigation
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$RECORDER');
  var r = gate({tool_name:'mcp__mcp-manager__mcpm', tool_input:{tool:'browser_navigate', arguments:{url:'https://portal.rdsec.trendmicro.com/platform/org/216'}}});
  process.stdout.write(r === null ? 'null' : JSON.stringify(r));
")
[ "$RESULT" = "null" ] && pass "T663 returns null (async)" || fail "T663 blocked: $RESULT"
[ -f "$EVIDENCE" ] && pass "T663 writes evidence file" || fail "T663 no evidence written"
grep -q "portal.rdsec.trendmicro.com" "$EVIDENCE" && pass "T663 evidence contains URL" || fail "T663 evidence wrong content"

# Test: records staging portal
rm -f "$EVIDENCE"
RESULT=$(PORTAL_EVIDENCE_PATH="$EVIDENCE" HOOK_RUNNER_TEST=1 node -e "
  var gate = require('./$RECORDER');
  gate({tool_name:'mcp__mcp-manager__mcpm', tool_input:{tool:'browser_navigate', arguments:{url:'https://portal-stg.rdsec.trendmicro.com/test'}}});
")
[ -f "$EVIDENCE" ] && pass "T663 records staging portal" || fail "T663 missed staging"

# Cleanup
rm -f "$EVIDENCE"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
