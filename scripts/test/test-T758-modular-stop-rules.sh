#!/usr/bin/env bash
# T758: Test modular stop rules — individual YAML files loaded by auto-continue-gate
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && (pwd -W 2>/dev/null || pwd))"
RULES_DIR="$PROJECT_DIR/rules/stop"
PASS=0; FAIL=0; TOTAL=0

check() {
  local desc="$1"
  TOTAL=$((TOTAL + 1))
  if eval "$2" 2>/dev/null; then
    PASS=$((PASS + 1))
    echo "  PASS: $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $desc"
  fi
}

echo "=== T758: Modular Stop Rules ==="

# Rule directory exists
check "rules/stop/ directory exists" \
  "[ -d '$RULES_DIR' ]"

# Has rules (exclude _prefixed and SUPERSEDED stubs)
count=0
for _f in "$RULES_DIR"/*.yaml; do
  _b=$(basename "$_f")
  [[ "$_b" == _* ]] && continue
  head -1 "$_f" | grep -q "SUPERSEDED" && continue
  count=$((count + 1))
done
check "Has YAML rule files ($count found)" \
  "[ $count -gt 0 ]"

# Each rule has name, check, and action
for f in "$RULES_DIR"/*.yaml; do
  base=$(basename "$f")
  if [[ "$base" == _* ]]; then continue; fi
  # Skip superseded stub files (e.g. 15-metacognate-next.yaml → 15-keep-working.yaml)
  if head -1 "$f" | grep -q "SUPERSEDED"; then continue; fi

  TOTAL=$((TOTAL + 1))
  has_name=$(grep -c '^name:' "$f" || true)
  has_check=$(grep -c '^check:' "$f" || true)
  has_action=$(grep -c '^action:' "$f" || true)
  if [[ $has_name -ge 1 && $has_check -ge 1 && $has_action -ge 1 ]]; then
    PASS=$((PASS + 1))
    echo "  PASS: $base has name+check+action"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL: $base missing fields (name=$has_name check=$has_check action=$has_action)"
  fi
done

# Verify gate regex can parse all rules
TOTAL=$((TOTAL + 1))
result=$(node -e "
var fs = require('fs');
var path = require('path');
var dir = '$RULES_DIR';
var files = fs.readdirSync(dir).filter(function(f) {
  if (!/\.yaml$/.test(f) || f.startsWith('_')) return false;
  var c = fs.readFileSync(path.join(dir, f), 'utf-8');
  return c.indexOf('SUPERSEDED') === -1;
});
var ok = 0, bad = 0;
for (var i = 0; i < files.length; i++) {
  var content = fs.readFileSync(path.join(dir, files[i]), 'utf-8');
  var nm = content.match(/^name:\s*(.+)/m);
  var ck = content.match(/^check:\s*\"(.+)\"/m);
  var ac = content.match(/^action:\s*\"(.+)\"/m);
  if (nm && ck && ac) ok++;
  else { bad++; process.stderr.write('PARSE FAIL: ' + files[i] + '\n'); }
}
process.stdout.write(ok + '/' + (ok + bad));
" 2>/dev/null)
if [[ "$result" == "$count/$count" ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: Gate regex parses all $count rules"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Gate regex parsed $result rules"
fi

# Verify numbered ordering (01-, 02-, etc.)
TOTAL=$((TOTAL + 1))
first=$(ls "$RULES_DIR"/*.yaml | head -1 | xargs basename)
last=$(ls "$RULES_DIR"/*.yaml | tail -1 | xargs basename)
if [[ "$first" == 01-* && "$last" == 2* ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: Rules are numbered (first=$first, last=$last)"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Expected numbered files (first=$first, last=$last)"
fi

# Verify no duplicate rule names
TOTAL=$((TOTAL + 1))
names=$(grep -h '^name:' "$RULES_DIR"/*.yaml | sort)
unique=$(echo "$names" | sort -u)
name_count=$(echo "$names" | wc -l)
unique_count=$(echo "$unique" | wc -l)
if [[ $name_count -eq $unique_count ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: No duplicate rule names ($name_count unique)"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Duplicate rule names found ($name_count total, $unique_count unique)"
fi

# Verify disabled rules (prefixed with _) are skipped
TOTAL=$((TOTAL + 1))
# Create a temp disabled rule
echo 'name: disabled-test
check: "test"
action: "test"' > "$RULES_DIR/_disabled-test.yaml"
disabled_count=$(node -e "
var fs = require('fs');
var path = require('path');
var dir = '$RULES_DIR';
var files = fs.readdirSync(dir).filter(function(f) {
  if (!/\.yaml$/.test(f) || f.startsWith('_')) return false;
  var c = fs.readFileSync(path.join(dir, f), 'utf-8');
  return c.indexOf('SUPERSEDED') === -1;
});
process.stdout.write('' + files.length);
" 2>/dev/null)
rm -f "$RULES_DIR/_disabled-test.yaml"
if [[ "$disabled_count" == "$count" ]]; then
  PASS=$((PASS + 1))
  echo "  PASS: Underscore-prefixed rules are excluded ($disabled_count active)"
else
  FAIL=$((FAIL + 1))
  echo "  FAIL: Disabled rule not excluded (expected $count, got $disabled_count)"
fi

echo ""
echo "=== Results: $PASS/$TOTAL passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
