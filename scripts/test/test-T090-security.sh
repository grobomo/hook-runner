#!/usr/bin/env bash
# Test T090: Security hardening — input sanitization
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== hook-runner: security hardening ==="

# Test: GitHub path sanitization regex
result=$(node -e '
var safe = /^[a-zA-Z0-9._\-\/]+$/;
var cases = [
  {input: "grobomo/hook-runner", expect: true},
  {input: "main", expect: true},
  {input: "modules/PreToolUse/secret-scan-gate.js", expect: true},
  {input: "foo\"; rm -rf /", expect: false},
  {input: "foo$(whoami)", expect: false},
  {input: "foo`id`bar", expect: false},
];
var ok = cases.every(function(c) { return safe.test(c.input) === c.expect; });
console.log(ok ? "ALL_PASS" : "SOME_FAIL");
' 2>&1)

if [ "$result" = "ALL_PASS" ]; then
  pass "GitHub path sanitization blocks injection"
else
  fail "GitHub path sanitization has gaps"
fi

# Test: file path sanitization regex (for openFile)
result=$(node -e '
var safe = /^[a-zA-Z0-9._\-\/\\: ]+$/;
var winPath = String.raw`D:\data\reports\hook-report.html`;
var unixPath = "/tmp/reports/report.html";
var spacePath = String.raw`D:\data\my dir\r.html`;
var bad1 = "foo\"; rm -rf /";
var bad2 = "$(whoami)";
var ok = safe.test(winPath) && safe.test(unixPath) && safe.test(spacePath)
      && !safe.test(bad1) && !safe.test(bad2);
console.log(ok ? "ALL_PASS" : "SOME_FAIL");
' 2>&1)

if [ "$result" = "ALL_PASS" ]; then
  pass "file path sanitization blocks injection"
else
  fail "file path sanitization has gaps"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
