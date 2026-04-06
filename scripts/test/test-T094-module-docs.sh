#!/usr/bin/env bash
# Test T094: Verify README documents all distributable modules
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0

check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}

echo "=== hook-runner: module documentation ==="

README="$REPO_DIR/README.md"

# Check all modules documented + count (single node call, avoids slow bash grep loop)
DOC_RESULT=$(node -e "
  var fs = require('fs'), path = require('path');
  var readme = fs.readFileSync('$REPO_DIR/README.md', 'utf-8');
  var mods = [];
  var events = ['PreToolUse','PostToolUse','SessionStart','Stop','UserPromptSubmit'];
  events.forEach(function(evt) {
    var dir = path.join('$REPO_DIR/modules', evt);
    try {
      fs.readdirSync(dir).forEach(function(f) {
        if (f.indexOf('.js') !== -1 && f !== 'archive') mods.push(f.replace('.js',''));
        var sub = path.join(dir, f);
        try {
          if (fs.statSync(sub).isDirectory() && f !== 'archive' && f.indexOf('_') !== 0) {
            fs.readdirSync(sub).forEach(function(sf) {
              if (sf.indexOf('.js') !== -1) mods.push(sf.replace('.js',''));
            });
          }
        } catch(e){}
      });
    } catch(e){}
  });
  var unique = Array.from(new Set(mods)).sort();
  var missing = unique.filter(function(m) { return readme.indexOf(m) === -1; });
  var readmeMods = (readme.match(/\| \x60[a-z]/g) || []).length;
  console.log(JSON.stringify({missing: missing, total: unique.length, readmeMods: readmeMods}));
")

MISSING=$(echo "$DOC_RESULT" | node -e "var d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(d.missing.join(' '))")
CATALOG_COUNT=$(echo "$DOC_RESULT" | node -e "var d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(String(d.total))")
README_MODS=$(echo "$DOC_RESULT" | node -e "var d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(String(d.readmeMods))")

check "all modules documented in README" '[ -z "$MISSING" ]'
if [ -n "$MISSING" ]; then
  echo "    Missing: $MISSING"
fi

# Check README has all 5 event sections
for evt in PreToolUse PostToolUse UserPromptSubmit Stop SessionStart; do
  check "$evt section exists" "grep -q '### $evt' '$README'"
done

check "README module count ($README_MODS) close to catalog ($CATALOG_COUNT)" '[ "$README_MODS" -ge "$((CATALOG_COUNT - 5))" ]'

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
