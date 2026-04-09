#!/usr/bin/env node
"use strict";
// T382: Tests for lesson-effectiveness.js — repeated lesson detection
var fs = require("fs");
var path = require("path");
var os = require("os");

var pass = 0, fail = 0;
function assert(ok, label) {
  if (ok) { pass++; console.log("OK: " + label); }
  else { fail++; console.log("FAIL: " + label); }
}

var modPath = path.join(__dirname, "../../modules/SessionStart/lesson-effectiveness.js");
assert(fs.existsSync(modPath), "module file exists");

var mod = require(modPath);
assert(typeof mod === "function", "module exports a function");

var src = fs.readFileSync(modPath, "utf-8");
assert(/\/\/\s*WHY:/.test(src), "has WHY comment");
assert(/\/\/\s*WORKFLOW:/.test(src), "has WORKFLOW comment");

// Setup temp files
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lesson-eff-"));
var lessonsPath = path.join(tmpDir, "lessons.jsonl");
var escalationPath = path.join(tmpDir, "escalations.jsonl");

// Test: no lessons file → null
var r = mod({_test_lessons_path: lessonsPath, _test_escalation_path: escalationPath});
assert(r === null || r === undefined, "no file: returns null");

// Test: fewer than threshold → null
fs.writeFileSync(lessonsPath, [
  JSON.stringify({ts: "2026-04-01", project: "proj", lesson: "Always check X before Y"}),
  JSON.stringify({ts: "2026-04-02", project: "proj", lesson: "Always check X before Y"})
].join("\n") + "\n");
r = mod({_test_lessons_path: lessonsPath, _test_escalation_path: escalationPath});
assert(r === null || r === undefined, "below threshold: returns null");

// Test: 3+ similar lessons → warns (returns null but writes escalation)
fs.writeFileSync(lessonsPath, [
  JSON.stringify({ts: "2026-04-01", project: "proj-a", lesson: "When running tests always verify the output matches expected results"}),
  JSON.stringify({ts: "2026-04-02", project: "proj-b", lesson: "When running tests always verify the output matches expected results"}),
  JSON.stringify({ts: "2026-04-03", project: "proj-a", lesson: "When running tests always verify the output matches expected results"})
].join("\n") + "\n");
if (fs.existsSync(escalationPath)) fs.unlinkSync(escalationPath);
r = mod({_test_lessons_path: lessonsPath, _test_escalation_path: escalationPath});
assert(r === null || r === undefined, "repeated lessons: still returns null (non-blocking)");
assert(fs.existsSync(escalationPath), "repeated lessons: writes escalation file");
var escContent = fs.readFileSync(escalationPath, "utf-8").trim();
var esc = JSON.parse(escContent.split("\n")[0]);
assert(esc.count === 3, "escalation count is 3");
assert(esc.projects.length === 2, "escalation tracks unique projects");

// Test: different lessons → no escalation
fs.writeFileSync(lessonsPath, [
  JSON.stringify({ts: "2026-04-01", project: "a", lesson: "Alpha beta gamma delta epsilon"}),
  JSON.stringify({ts: "2026-04-02", project: "b", lesson: "Zeta theta iota kappa lambda"}),
  JSON.stringify({ts: "2026-04-03", project: "c", lesson: "Mu nu omicron sigma upsilon"})
].join("\n") + "\n");
if (fs.existsSync(escalationPath)) fs.unlinkSync(escalationPath);
r = mod({_test_lessons_path: lessonsPath, _test_escalation_path: escalationPath});
assert(!fs.existsSync(escalationPath) || fs.readFileSync(escalationPath, "utf-8").trim() === "", "different lessons: no escalation");

// Cleanup
try { fs.unlinkSync(lessonsPath); } catch(e) {}
try { fs.unlinkSync(escalationPath); } catch(e) {}
try { fs.rmdirSync(tmpDir); } catch(e) {}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
