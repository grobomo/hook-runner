#!/usr/bin/env bash
# Test T555: no-polling-gate PreToolUse module
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: no-polling-gate ==="

MOD="$REPO_DIR/modules/PreToolUse/no-polling-gate.js"

run_gate() {
  node -e "
    var m = require('$MOD');
    var r = m({tool_name:'$1', tool_input:{command: $(echo "$2" | node -e "var s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>console.log(JSON.stringify(s)))")}});
    console.log(r === null ? 'null' : 'block');
  " 2>&1
}

# 1. Module exports a function
check "module exports function" 'node -e "var m = require(\"'$MOD'\"); console.log(typeof m);" 2>&1 | grep -q "function"'

# 2. Has WORKFLOW tag
check "has WORKFLOW tag" 'head -3 "$MOD" | grep -q "WORKFLOW:"'

# 3. Has WHY comment
check "has WHY comment" 'head -7 "$MOD" | grep -q "// WHY:"'

# 4. Has TOOLS tag
check "has TOOLS tag" 'head -2 "$MOD" | grep -q "// TOOLS: Bash"'

# 5. Skips non-Bash tools
OUT=$(node -e "
  var m = require('$MOD');
  var r = m({tool_name:'Write', tool_input:{file_path:'/tmp/x.js', content:'hello'}});
  console.log(r === null ? 'null' : 'block');
" 2>&1)
check "skips non-Bash tools" '[ "$OUT" = "null" ]'

# 6. Allows normal commands
OUT=$(run_gate Bash "git status")
check "allows git status" '[ "$OUT" = "null" ]'

OUT=$(run_gate Bash "npm install")
check "allows npm install" '[ "$OUT" = "null" ]'

OUT=$(run_gate Bash "curl https://example.com")
check "allows single curl" '[ "$OUT" = "null" ]'

# 7. Blocks while+sleep+curl polling loop
OUT=$(run_gate Bash "while true; do sleep 10; curl http://api.example.com/status; done")
check "blocks while+sleep+curl loop" '[ "$OUT" = "block" ]'

# 8. Blocks for+sleep+gh polling loop
OUT=$(run_gate Bash "for i in 1 2 3; do sleep 5; gh run view 12345; done")
check "blocks for+sleep+gh loop" '[ "$OUT" = "block" ]'

# 9. Blocks while+sleep+kubectl polling
OUT=$(run_gate Bash "while true; do sleep 30; kubectl get pods; done")
check "blocks while+sleep+kubectl loop" '[ "$OUT" = "block" ]'

# 10. Blocks until+sleep polling
OUT=$(run_gate Bash "until curl -s http://localhost:8080/health; do sleep 5; done")
check "blocks until+sleep polling" '[ "$OUT" = "block" ]'

# 11. Blocks gh api comments (GET)
OUT=$(run_gate Bash "gh api repos/owner/repo/issues/42/comments")
check "blocks gh api comments GET" '[ "$OUT" = "block" ]'

# 12. Allows gh api comments with POST
OUT=$(run_gate Bash "gh api repos/owner/repo/issues/42/comments --method POST -f body=hello")
check "allows gh api comments POST" '[ "$OUT" = "null" ]'

# 13. Allows gh api comments with -X POST
OUT=$(run_gate Bash "gh api repos/owner/repo/issues/42/comments -X POST -f body=hello")
check "allows gh api comments -X POST" '[ "$OUT" = "null" ]'

# 14. Blocks journalctl -f
OUT=$(run_gate Bash "journalctl -f -u myservice")
check "blocks journalctl -f" '[ "$OUT" = "block" ]'

# 15. Blocks journalctl --follow
OUT=$(run_gate Bash "journalctl --follow -u myservice")
check "blocks journalctl --follow" '[ "$OUT" = "block" ]'

# 16. Blocks tail -f
OUT=$(run_gate Bash "tail -f /var/log/syslog")
check "blocks tail -f" '[ "$OUT" = "block" ]'

# 17. Blocks tail --follow
OUT=$(run_gate Bash "tail --follow /var/log/app.log")
check "blocks tail --follow" '[ "$OUT" = "block" ]'

# 18. Blocks kubectl logs -f
OUT=$(run_gate Bash "kubectl logs -f pod/my-pod")
check "blocks kubectl logs -f" '[ "$OUT" = "block" ]'

# 19. Blocks docker logs --follow
OUT=$(run_gate Bash "docker logs --follow my-container")
check "blocks docker logs --follow" '[ "$OUT" = "block" ]'

# 20. Blocks watch command
OUT=$(run_gate Bash "watch kubectl get pods")
check "blocks watch command" '[ "$OUT" = "block" ]'

# 21. Allows tail without -f (snapshot)
OUT=$(run_gate Bash "tail -n 50 /var/log/syslog")
check "allows tail -n 50 (snapshot)" '[ "$OUT" = "null" ]'

# 22. Allows journalctl without -f (snapshot)
OUT=$(run_gate Bash "journalctl -n 50 -u myservice")
check "allows journalctl -n 50 (snapshot)" '[ "$OUT" = "null" ]'

# 23. Allows kubectl logs without -f (snapshot)
OUT=$(run_gate Bash "kubectl logs pod/my-pod --tail=50")
check "allows kubectl logs --tail (snapshot)" '[ "$OUT" = "null" ]'

# 24. Blocks while+sleep+az polling
OUT=$(run_gate Bash "while true; do sleep 60; az deployment show -n my-deploy; done")
check "blocks while+sleep+az loop" '[ "$OUT" = "block" ]'

# 25. Blocks while+sleep+aws polling
OUT=$(run_gate Bash "while true; do sleep 30; aws cloudformation describe-stacks; done")
check "blocks while+sleep+aws loop" '[ "$OUT" = "block" ]'

# 26. Allows empty command
OUT=$(node -e "
  var m = require('$MOD');
  var r = m({tool_name:'Bash', tool_input:{command:''}});
  console.log(r === null ? 'null' : 'block');
" 2>&1)
check "allows empty command" '[ "$OUT" = "null" ]'

# 27. Block message mentions webhooks
OUT=$(node -e "
  var m = require('$MOD');
  var r = m({tool_name:'Bash', tool_input:{command:'while true; do sleep 10; curl http://x; done'}});
  console.log(r && r.reason ? r.reason : '');
" 2>&1)
check "block message mentions webhooks" 'echo "$OUT" | grep -qi "webhook"'

# 28. Block message mentions script alternative
check "block message mentions script" 'echo "$OUT" | grep -qi "script"'

# 29. In starter workflow
check "in starter workflow" 'grep -q "no-polling-gate" "$REPO_DIR/workflows/starter.yml"'

# 30. In shtd workflow
check "in shtd workflow" 'grep -q "no-polling-gate" "$REPO_DIR/workflows/shtd.yml"'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
