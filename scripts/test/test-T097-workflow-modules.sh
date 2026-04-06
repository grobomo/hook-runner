#!/usr/bin/env bash
# Test T097: Workflow YAML files have modules: field listing member modules
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0

check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}

echo "=== hook-runner: workflow modules field ==="

# Every workflow YAML should have a modules: section
for yml in "$REPO_DIR"/workflows/*.yml; do
  name=$(basename "$yml" .yml)
  check "$name.yml has modules: field" "grep -q '^modules:' '$yml'"
done

# workflow.js loadWorkflow should parse modules field
MOD_COUNT=$(node -e "
  var wf = require('$REPO_DIR/workflow.js');
  var w = wf.loadWorkflow('$REPO_DIR/workflows/shtd.yml');
  console.log((w.modules || []).length);
")
check "shtd workflow has modules listed" '[ "$MOD_COUNT" -gt 0 ]'

# Modules listed in workflows should exist in modules/ catalog (use node, not find)
MISSING=$(node -e "
  var fs = require('fs'), path = require('path');
  var wf = require('$REPO_DIR/workflow.js');
  var ymls = fs.readdirSync('$REPO_DIR/workflows').filter(function(f){return f.indexOf('.yml')!==-1});
  var missing = [];
  ymls.forEach(function(y) {
    var w = wf.loadWorkflow(path.join('$REPO_DIR/workflows', y));
    var mods = w.modules || [];
    var name = y.replace('.yml','');
    mods.forEach(function(m) {
      var events = ['PreToolUse','PostToolUse','SessionStart','Stop','UserPromptSubmit'];
      var found = false;
      for (var i = 0; i < events.length; i++) {
        var p = path.join('$REPO_DIR/modules', events[i], m + '.js');
        if (fs.existsSync(p)) { found = true; break; }
        // Check project subdirs
        var evtDir = path.join('$REPO_DIR/modules', events[i]);
        try {
          var subs = fs.readdirSync(evtDir, {withFileTypes:true}).filter(function(d){return d.isDirectory()&&d.name!=='archive'});
          for (var s = 0; s < subs.length; s++) {
            if (fs.existsSync(path.join(evtDir, subs[s].name, m + '.js'))) { found = true; break; }
          }
        } catch(e){}
        if (found) break;
      }
      if (!found) missing.push(name + ':' + m);
    });
  });
  if (missing.length) console.log(missing.join(' '));
")
check "all workflow modules exist in catalog" '[ -z "$MISSING" ]'
if [ -n "$MISSING" ]; then
  echo "    Missing: $MISSING"
fi

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
