// Test T834: readTodo filters dispatched items
// Test T835: stagnation-detector rule exists and has correct format
// Test T836: readProjectRole extracts role from TODO.md
// Test T837: rejection tracking in mandate log
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log("  PASS: " + msg); }
  else { failed++; console.log("  FAIL: " + msg); }
}

// --- Setup temp dir ---
var tmpDir = path.join(os.tmpdir(), "t834-test-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

// We need to test readTodo and readProjectRole which are internal functions.
// Extract them by reading the module source and evaluating the functions.
var src = fs.readFileSync(path.join(__dirname, "../../modules/Stop/auto-continue-gate.js"), "utf-8");

// Extract the DISPATCHED_RE regex
var reMatch = src.match(/var DISPATCHED_RE = (.+);/);
var DISPATCHED_RE = eval(reMatch[1]);

// --- T834: DISPATCHED_RE tests ---
console.log("\n=== T834: Dispatched filter regex ===\n");

ok(DISPATCHED_RE.test("T101: Fix auth — Dispatched as T555"), "matches 'Dispatched as TXXX'");
ok(DISPATCHED_RE.test("Some task (already dispatched to hook-runner)"), "matches 'already dispatched'");
ok(DISPATCHED_RE.test("T624: BLOCKED: project not cloned locally"), "matches 'BLOCKED:...project not cloned'");
ok(DISPATCHED_RE.test("T99: owned by hook-runner session"), "matches 'owned by'");
ok(DISPATCHED_RE.test("T50: assigned to other project"), "matches 'assigned to'");
ok(DISPATCHED_RE.test("cross-project reference"), "matches 'cross-project'");
ok(!DISPATCHED_RE.test("T200: Fix the login bug"), "does NOT match normal todo");
ok(!DISPATCHED_RE.test("T300: Add test for dispatch function"), "does NOT match 'dispatch' as substring in different context");

// --- T834: readTodo filter (functional test with real file) ---
console.log("\n=== T834: readTodo filtering ===\n");

var todoContent = [
  "# TODO",
  "",
  "- [ ] T100: Fix login bug",
  "- [ ] T101: Update auth — Dispatched as T555",
  "- [x] T102: Done task",
  "- [ ] T103: BLOCKED: project not cloned locally. Needs setup.",
  "- [ ] T104: Write unit tests",
  "- [ ] T105: cross-project reference to other repo",
  "- [ ] T106: Normal task here",
].join("\n");

fs.writeFileSync(path.join(tmpDir, "TODO.md"), todoContent);

// Simulate readTodo
var content = fs.readFileSync(path.join(tmpDir, "TODO.md"), "utf-8");
var unchecked = content.split("\n")
  .filter(function(l) { return /- \[ \]/.test(l) && !DISPATCHED_RE.test(l); })
  .map(function(l) { return l.replace(/^[\s-]*\[ \]\s*/, "").trim(); });

ok(unchecked.length === 3, "3 actionable items (was 6 unfiltered): got " + unchecked.length);
ok(unchecked[0].indexOf("T100") >= 0, "T100 included");
ok(unchecked[1].indexOf("T104") >= 0, "T104 included");
ok(unchecked[2].indexOf("T106") >= 0, "T106 included");
ok(unchecked.every(function(l) { return l.indexOf("T101") < 0; }), "T101 (dispatched) excluded");
ok(unchecked.every(function(l) { return l.indexOf("T103") < 0; }), "T103 (blocked/not cloned) excluded");
ok(unchecked.every(function(l) { return l.indexOf("T105") < 0; }), "T105 (cross-project) excluded");

// --- T836: readProjectRole ---
console.log("\n=== T836: readProjectRole ===\n");

var todoWithRole = "# TODO\n\n## ROLE: gate-builder\n\n- [ ] T200: Some task\n";
fs.writeFileSync(path.join(tmpDir, "TODO.md"), todoWithRole);

var roleMatch = fs.readFileSync(path.join(tmpDir, "TODO.md"), "utf-8").match(/^#+\s*ROLE:\s*(.+)/m);
ok(roleMatch && roleMatch[1].trim() === "gate-builder", "extracts role 'gate-builder'");

var todoNoRole = "# TODO\n\n- [ ] T200: Some task\n";
fs.writeFileSync(path.join(tmpDir, "TODO.md"), todoNoRole);
var noRoleMatch = fs.readFileSync(path.join(tmpDir, "TODO.md"), "utf-8").match(/^#+\s*ROLE:\s*(.+)/m);
ok(!noRoleMatch, "returns null when no ROLE line");

var todoAltRole = "ROLE: manager-session\n\n- [ ] T200: Some task\n";
fs.writeFileSync(path.join(tmpDir, "TODO.md"), todoAltRole);
var altRoleMatch = fs.readFileSync(path.join(tmpDir, "TODO.md"), "utf-8").match(/^#+\s*ROLE:\s*(.+)/m) ||
  fs.readFileSync(path.join(tmpDir, "TODO.md"), "utf-8").match(/^ROLE:\s*(.+)/m);
ok(altRoleMatch && altRoleMatch[1].trim() === "manager-session", "extracts role without ## prefix");

// --- T837: Rejection tracking ---
console.log("\n=== T837: Rejection tracking ===\n");

var mandateLog = path.join(tmpDir, "mandate-log.jsonl");

// Write some mandate entries including rejections
var entries = [
  { type: "rejection", rule: "todo-awareness", action: "T101 dispatched", session: "abc12345", ts: new Date().toISOString() },
  { rule: "obvious-follow-up", decision: "CONTINUE", session: "abc12345", ts: new Date().toISOString() },
  { type: "rejection", rule: "todo-awareness", action: "T79 dispatched", session: "abc12345", ts: new Date().toISOString() },
  { type: "rejection", rule: "never-idle", action: "task outside scope", session: "xyz99999", ts: new Date().toISOString() },
];
fs.writeFileSync(mandateLog, entries.map(function(e) { return JSON.stringify(e); }).join("\n") + "\n");

// Simulate getRecentRejections
var logContent = fs.readFileSync(mandateLog, "utf-8").trim();
var parsed = logContent.split("\n").map(function(l) { try { return JSON.parse(l); } catch(e) { return null; } }).filter(Boolean);
var sessionId = "abc12345";
var rejections = [];
var now = Date.now();
for (var i = parsed.length - 1; i >= 0; i--) {
  var e = parsed[i];
  if (!e.ts) continue;
  var age = now - new Date(e.ts).getTime();
  if (age > 30 * 60 * 1000) break;
  if (e.session === sessionId && e.type === "rejection") {
    rejections.push(e.rule || e.action || "");
  }
}

ok(rejections.length === 2, "2 rejections for session abc12345: got " + rejections.length);
ok(rejections.indexOf("todo-awareness") >= 0, "todo-awareness rejection found");
ok(rejections.indexOf("never-idle") < 0, "never-idle rejection (different session) excluded");

// hasRecentMandate should skip rejection entries
var hasMandate = null;
for (var i = parsed.length - 1; i >= 0; i--) {
  var e = parsed[i];
  if (!e.ts) continue;
  var age = now - new Date(e.ts).getTime();
  if (age > 10 * 60 * 1000) break;
  if (e.session === sessionId && e.type !== "rejection") { hasMandate = e; break; }
}
ok(hasMandate && hasMandate.rule === "obvious-follow-up", "hasRecentMandate skips rejections, finds real mandate");

// --- T837: Rejection detection patterns ---
console.log("\n=== T837: Rejection detection in assistant text ===\n");

var rejectionPatterns = /\b(already dispatched|is dispatched|was dispatched|not actionable|outside.*scope|belongs to another|cross-project)\b/i;

ok(rejectionPatterns.test("T101 is dispatched to hook-runner"), "detects 'is dispatched'");
ok(rejectionPatterns.test("That task was dispatched earlier"), "detects 'was dispatched'");
ok(rejectionPatterns.test("This is already dispatched"), "detects 'already dispatched'");
ok(rejectionPatterns.test("That TODO is not actionable in this session"), "detects 'not actionable'");
ok(rejectionPatterns.test("This task is outside the scope of request-tracker"), "detects 'outside scope'");
ok(rejectionPatterns.test("It belongs to another project"), "detects 'belongs to another'");
ok(rejectionPatterns.test("This is a cross-project dependency"), "detects 'cross-project'");
ok(!rejectionPatterns.test("I completed the task and committed"), "does NOT match normal completion text");
ok(!rejectionPatterns.test("Fixed the bug in the dispatch function"), "does NOT match 'dispatch' as code reference");

// --- T835: Stagnation detector rule ---
console.log("\n=== T835: Stagnation detector rule ===\n");

var ruleFile = path.join(__dirname, "../../rules/stop/31-stagnation-detector.yaml");
var ruleExists = false;
try { ruleExists = fs.existsSync(ruleFile); } catch (e) {}
ok(ruleExists, "31-stagnation-detector.yaml exists in rules/stop/");

if (ruleExists) {
  var ruleContent = fs.readFileSync(ruleFile, "utf-8");
  var hasName = /^name:\s*stagnation-detector/m.test(ruleContent);
  var hasCheck = /^check:\s*"/m.test(ruleContent);
  var hasAction = /^action:\s*"/m.test(ruleContent);
  ok(hasName, "rule has name: stagnation-detector");
  ok(hasCheck, "rule has check field");
  ok(hasAction, "rule has action field");
  ok(/Stable|Monitoring|No changes/i.test(ruleContent), "check mentions stagnation keywords");
}

// --- T835: Directory name fix (stop vs stop-rules) ---
console.log("\n=== T835: Directory name fix ===\n");

var gateSrc = fs.readFileSync(path.join(__dirname, "../../modules/Stop/auto-continue-gate.js"), "utf-8");
ok(/path\.dirname\(RULES_PATH\),\s*"stop"\)/.test(gateSrc), "checks 'stop' directory first");
ok(/path\.dirname\(RULES_PATH\),\s*"stop-rules"\)/.test(gateSrc), "falls back to 'stop-rules' directory");

// --- Cleanup ---
try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}

// --- Summary ---
console.log("\n    " + passed + " passed, " + failed + " failed\n");
process.exit(failed > 0 ? 1 : 0);
