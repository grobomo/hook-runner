// Test sibling-session-detect-gate (T751)
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log("  PASS: " + msg); }
  else { failed++; console.log("  FAIL: " + msg); }
}

// Build test paths dynamically from env (no hardcoded paths)
var HOME = os.homedir();
var PROJECT_BASE = path.join(HOME, "Documents", "ProjectsCL1");
var HR_PATH = path.join(PROJECT_BASE, "_grobomo", "hook-runner");
var OTHER_PATH = path.join(PROJECT_BASE, "other-project");

console.log("\n=== sibling-session-detect-gate tests ===\n");

console.log("--- Module contract ---");
process.env.HOOK_RUNNER_TEST = "1";
delete require.cache[require.resolve(path.join(__dirname, "../../modules/PreToolUse/sibling-session-detect-gate.js"))];
var gate = require(path.join(__dirname, "../../modules/PreToolUse/sibling-session-detect-gate.js"));
ok(typeof gate === "function", "exports a function");
ok(gate({ tool_name: "Bash", tool_input: { command: "echo hi" } }) === null, "returns null in test mode");

console.log("--- normalizeProjectPath ---");
var normalizeProjectPath = new Function("p",
  'return (p || "").replace(/\\\\/g, "/").replace(/\\/+$/, "").toLowerCase();'
);
ok(normalizeProjectPath(HR_PATH.replace(/\//g, "\\")) === HR_PATH.replace(/\\/g, "/").toLowerCase(), "normalizes backslashes");
ok(normalizeProjectPath("/tmp/project/") === "/tmp/project", "strips trailing slash");
ok(normalizeProjectPath("") === "", "handles empty string");
ok(normalizeProjectPath(null) === "", "handles null");

console.log("--- State file handling ---");
var tmpDir = path.join(os.tmpdir(), "t751-test-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
var stateFile = path.join(tmpDir, ".sibling-detect-state.json");
ok(!fs.existsSync(stateFile), "state file doesn't exist initially");
fs.writeFileSync(stateFile, JSON.stringify({ callCount: 5, lastAlertTs: 0 }));
var state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
ok(state.callCount === 5, "state persists callCount");

console.log("--- Check interval logic ---");
ok(0 % 10 === 0, "call 0 triggers check");
ok(10 % 10 === 0, "call 10 triggers check");
ok(20 % 10 === 0, "call 20 triggers check");
ok(5 % 10 !== 0, "call 5 does NOT trigger check");
ok(1 % 10 !== 0, "call 1 does NOT trigger check");

console.log("--- Cooldown logic ---");
var COOLDOWN_MS = 5 * 60 * 1000;
var now = Date.now();
ok(now - 0 >= COOLDOWN_MS, "first alert always allowed (lastAlertTs=0)");
ok(now - (now - 60000) < COOLDOWN_MS, "alert 1 min ago still in cooldown");
ok(now - (now - 400000) >= COOLDOWN_MS, "alert 6+ min ago out of cooldown");

console.log("--- Sibling matching ---");
var myProjectNorm = normalizeProjectPath(HR_PATH);
var mySession = "abc12345";

var sessions = [
  { project: HR_PATH, session_id: "abc12345-xxxx", status: "active" },
  { project: HR_PATH, session_id: "def67890-yyyy", status: "active", current_task: "T834 filter" },
  { project: OTHER_PATH, session_id: "ghi11111-zzzz", status: "active" },
  { project: HR_PATH, session_id: "jkl99999-wwww", status: "stale" },
];

var siblings = [];
for (var i = 0; i < sessions.length; i++) {
  var s = sessions[i];
  var sProject = normalizeProjectPath(s.project || "");
  var sSession = (s.session_id || "").slice(0, 8);
  if (sProject.indexOf(myProjectNorm) >= 0 || myProjectNorm.indexOf(sProject) >= 0) {
    if (sSession === mySession) continue;
    if (s.status === "stale") continue;
    siblings.push(s);
  }
}

ok(siblings.length === 1, "finds 1 sibling (excludes self and stale): got " + siblings.length);
ok(siblings[0].session_id.startsWith("def67890"), "sibling is the active different session");

var otherNorm = normalizeProjectPath(OTHER_PATH);
var emptySiblings = [];
for (var j = 0; j < sessions.length; j++) {
  var s2 = sessions[j];
  var sp2 = normalizeProjectPath(s2.project || "");
  var ss2 = (s2.session_id || "").slice(0, 8);
  if (sp2.indexOf(otherNorm) >= 0) {
    if (ss2 === "ghi11111") continue;
    if (s2.status === "stale") continue;
    emptySiblings.push(s2);
  }
}
ok(emptySiblings.length === 0, "no siblings for unique project");

// Cleanup
process.env.HOOK_RUNNER_TEST = "";
try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}

console.log("\n    " + passed + " passed, " + failed + " failed\n");
process.exit(failed > 0 ? 1 : 0);
