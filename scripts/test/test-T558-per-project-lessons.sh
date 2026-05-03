#!/usr/bin/env bash
# Test T558: Per-project lesson files
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
PASS=0; FAIL=0
check() {
  if eval "$2"; then PASS=$((PASS+1)); echo "  PASS: $1"
  else FAIL=$((FAIL+1)); echo "  FAIL: $1"; fi
}
echo "=== hook-runner: T558 per-project lessons ==="

HELPER="$REPO_DIR/scripts/test/.t558-helper.js"
cat > "$HELPER" <<'JSEOF'
var fs = require("fs"), os = require("os"), path = require("path");
var REPO = path.resolve(__dirname, "../..");
var LOAD_MOD = path.join(REPO, "modules/SessionStart/load-lessons.js");
var REFL_MOD = path.join(REPO, "modules/Stop/self-reflection.js");

// Temp dirs for isolated testing
var TMPDIR = path.join(os.tmpdir(), ".t558-test-" + process.pid);
var FAKE_HOME = path.join(TMPDIR, "home");
var FAKE_PROJECT = path.join(TMPDIR, "project");
var GLOBAL_DIR = path.join(FAKE_HOME, ".claude", "hooks");
var PROJECT_DIR = path.join(FAKE_PROJECT, ".claude");

function setup() {
  fs.mkdirSync(GLOBAL_DIR, { recursive: true });
  fs.mkdirSync(PROJECT_DIR, { recursive: true });
}

function cleanup() {
  try { fs.rmSync(TMPDIR, { recursive: true, force: true }); } catch(e) {}
}

function fresh(mod) {
  delete require.cache[require.resolve(mod)];
  return require(mod);
}

function writeGlobalLesson(lesson) {
  var f = path.join(GLOBAL_DIR, "self-analysis-lessons.jsonl");
  fs.appendFileSync(f, JSON.stringify({ lesson: lesson, ts: new Date().toISOString() }) + "\n");
}

function writeProjectLesson(lesson) {
  var f = path.join(PROJECT_DIR, "lessons.jsonl");
  fs.appendFileSync(f, JSON.stringify({ lesson: lesson, ts: new Date().toISOString() }) + "\n");
}

var action = process.argv[2];

if (action === "load-global-only") {
  setup();
  // Override os.homedir and env
  var origHome = os.homedir;
  os.homedir = function() { return FAKE_HOME; };
  delete process.env.CLAUDE_PROJECT_DIR;
  writeGlobalLesson("Global lesson A");
  writeGlobalLesson("Global lesson B");
  var m = fresh(LOAD_MOD);
  var r = m({});
  os.homedir = origHome;
  cleanup();
  if (!r || !r.text) { console.log("no-output"); process.exit(0); }
  var hasA = r.text.indexOf("Global lesson A") >= 0;
  var hasB = r.text.indexOf("Global lesson B") >= 0;
  console.log(hasA && hasB ? "both" : "missing");
}
else if (action === "load-project-only") {
  setup();
  var origHome = os.homedir;
  os.homedir = function() { return FAKE_HOME; };
  process.env.CLAUDE_PROJECT_DIR = FAKE_PROJECT;
  writeProjectLesson("Project lesson X");
  writeProjectLesson("Project lesson Y");
  var m = fresh(LOAD_MOD);
  var r = m({});
  os.homedir = origHome;
  delete process.env.CLAUDE_PROJECT_DIR;
  cleanup();
  if (!r || !r.text) { console.log("no-output"); process.exit(0); }
  var hasX = r.text.indexOf("Project lesson X") >= 0;
  var hasY = r.text.indexOf("Project lesson Y") >= 0;
  console.log(hasX && hasY ? "both" : "missing");
}
else if (action === "load-both-merged") {
  setup();
  var origHome = os.homedir;
  os.homedir = function() { return FAKE_HOME; };
  process.env.CLAUDE_PROJECT_DIR = FAKE_PROJECT;
  writeGlobalLesson("Universal: never poll from LLM");
  writeProjectLesson("DDEI: use force click for popovers");
  var m = fresh(LOAD_MOD);
  var r = m({});
  os.homedir = origHome;
  delete process.env.CLAUDE_PROJECT_DIR;
  cleanup();
  if (!r || !r.text) { console.log("no-output"); process.exit(0); }
  var hasGlobal = r.text.indexOf("never poll from LLM") >= 0;
  var hasProject = r.text.indexOf("force click for popovers") >= 0;
  console.log(hasGlobal && hasProject ? "both" : "missing");
}
else if (action === "load-dedup") {
  setup();
  var origHome = os.homedir;
  os.homedir = function() { return FAKE_HOME; };
  process.env.CLAUDE_PROJECT_DIR = FAKE_PROJECT;
  writeGlobalLesson("Same lesson");
  writeProjectLesson("Same lesson");
  writeProjectLesson("Unique project lesson");
  var m = fresh(LOAD_MOD);
  var r = m({});
  os.homedir = origHome;
  delete process.env.CLAUDE_PROJECT_DIR;
  cleanup();
  if (!r || !r.text) { console.log("no-output"); process.exit(0); }
  // Count occurrences of "Same lesson"
  var count = (r.text.match(/Same lesson/g) || []).length;
  console.log(count === 1 ? "deduped" : "count:" + count);
}
else if (action === "load-project-priority") {
  setup();
  var origHome = os.homedir;
  os.homedir = function() { return FAKE_HOME; };
  process.env.CLAUDE_PROJECT_DIR = FAKE_PROJECT;
  // Write project lessons first, then global
  writeProjectLesson("Project first");
  writeGlobalLesson("Global second");
  var m = fresh(LOAD_MOD);
  var r = m({});
  os.homedir = origHome;
  delete process.env.CLAUDE_PROJECT_DIR;
  cleanup();
  if (!r || !r.text) { console.log("no-output"); process.exit(0); }
  var projIdx = r.text.indexOf("Project first");
  var globalIdx = r.text.indexOf("Global second");
  console.log(projIdx < globalIdx ? "project-first" : "wrong-order");
}
else if (action === "instruction-has-project-path") {
  setup();
  var origHome = os.homedir;
  os.homedir = function() { return FAKE_HOME; };
  process.env.CLAUDE_PROJECT_DIR = FAKE_PROJECT;
  var m = fresh(LOAD_MOD);
  var r = m({});
  os.homedir = origHome;
  var projDir = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  cleanup();
  if (!r || !r.text) { console.log("no-output"); process.exit(0); }
  // Should reference .claude/lessons.jsonl, not global path
  var hasProjectRef = r.text.indexOf("lessons.jsonl") >= 0;
  console.log(hasProjectRef ? "has-ref" : "no-ref");
}
else if (action === "instruction-fallback-global") {
  setup();
  var origHome = os.homedir;
  os.homedir = function() { return FAKE_HOME; };
  delete process.env.CLAUDE_PROJECT_DIR;
  var m = fresh(LOAD_MOD);
  var r = m({});
  os.homedir = origHome;
  cleanup();
  if (!r || !r.text) { console.log("no-output"); process.exit(0); }
  var hasGlobalRef = r.text.indexOf("self-analysis-lessons.jsonl") >= 0;
  console.log(hasGlobalRef ? "has-global" : "no-global");
}
else if (action === "reflection-getlessonsfile") {
  // Test that self-reflection.js has getLessonsFile function
  setup();
  var src = fs.readFileSync(REFL_MOD, "utf-8");
  var hasFunc = src.indexOf("function getLessonsFile") >= 0;
  var usesFunc = (src.match(/getLessonsFile\(\)/g) || []).length;
  var noOldRef = src.indexOf("appendFileSync(LESSONS_FILE") === -1;
  cleanup();
  console.log(hasFunc && usesFunc >= 2 && noOldRef ? "correct" : "hasFunc:" + hasFunc + ",uses:" + usesFunc + ",noOld:" + noOldRef);
}
else if (action === "reflection-global-lessons-renamed") {
  var src = fs.readFileSync(REFL_MOD, "utf-8");
  var hasGlobal = src.indexOf("GLOBAL_LESSONS_FILE") >= 0;
  var noOldVar = (src.match(/^var LESSONS_FILE\b/m) || []).length === 0;
  console.log(hasGlobal && noOldVar ? "renamed" : "not-renamed");
}
JSEOF
trap 'rm -f "$HELPER"' EXIT

H="node $HELPER"

# --- load-lessons.js structure ---
check "has WORKFLOW tag" 'head -3 "$REPO_DIR/modules/SessionStart/load-lessons.js" | grep -q "WORKFLOW:"'
check "has WHY comment" 'head -10 "$REPO_DIR/modules/SessionStart/load-lessons.js" | grep -q "// WHY:"'
check "has getProjectLessonsFile function" 'grep -q "getProjectLessonsFile" "$REPO_DIR/modules/SessionStart/load-lessons.js"'
check "has readLessonsFrom helper" 'grep -q "readLessonsFrom" "$REPO_DIR/modules/SessionStart/load-lessons.js"'

# --- Loading behavior ---
OUT=$($H load-global-only)
check "loads global lessons when no project" '[ "$OUT" = "both" ]'

OUT=$($H load-project-only)
check "loads per-project lessons" '[ "$OUT" = "both" ]'

OUT=$($H load-both-merged)
check "merges global + project lessons" '[ "$OUT" = "both" ]'

OUT=$($H load-dedup)
check "deduplicates identical lessons" '[ "$OUT" = "deduped" ]'

OUT=$($H load-project-priority)
check "project lessons appear before global" '[ "$OUT" = "project-first" ]'

# --- Instruction text ---
OUT=$($H instruction-has-project-path)
check "instruction references per-project path" '[ "$OUT" = "has-ref" ]'

OUT=$($H instruction-fallback-global)
check "instruction falls back to global without project" '[ "$OUT" = "has-global" ]'

# --- self-reflection.js changes ---
OUT=$($H reflection-getlessonsfile)
check "self-reflection uses getLessonsFile()" '[ "$OUT" = "correct" ]'

OUT=$($H reflection-global-lessons-renamed)
check "LESSONS_FILE renamed to GLOBAL_LESSONS_FILE" '[ "$OUT" = "renamed" ]'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
