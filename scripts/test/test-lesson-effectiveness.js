#!/usr/bin/env node
"use strict";
// Tests for modules/SessionStart/lesson-effectiveness.js
// lesson-effectiveness reads JSONL lessons, clusters similar ones, and warns
// about repeated patterns. It supports _test_lessons_path injection.

var path = require("path");
var fs = require("fs");
var os = require("os");

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "SessionStart", "lesson-effectiveness.js");

var passed = 0;
var failed = 0;

function assert(label, condition) {
  if (condition) { console.log("OK: " + label); passed++; }
  else { console.log("FAIL: " + label); failed++; }
}

var mod = require(MOD_PATH);

assert("Is a function", typeof mod === "function");

// --- Test with no file ---
var tmpDir = path.join(os.tmpdir(), "test-lesson-eff-" + process.pid);
try { fs.mkdirSync(tmpDir, { recursive: true }); } catch(e) {}

var noFile = path.join(tmpDir, "nonexistent.jsonl");
var escalationFile = path.join(tmpDir, "escalations.jsonl");

var r1 = mod({ _test_lessons_path: noFile, _test_escalation_path: escalationFile });
assert("Returns null when lessons file doesn't exist", r1 === null);

// --- Test with too few lessons ---
var fewFile = path.join(tmpDir, "few.jsonl");
fs.writeFileSync(fewFile, '{"lesson":"test1","ts":"2026-01-01"}\n{"lesson":"test2","ts":"2026-01-02"}\n');
var r2 = mod({ _test_lessons_path: fewFile, _test_escalation_path: escalationFile });
assert("Returns null when fewer than threshold lessons", r2 === null);

// --- Test with many unique lessons (no clusters) ---
var uniqueFile = path.join(tmpDir, "unique.jsonl");
var uniqueLines = [];
for (var i = 0; i < 10; i++) {
  uniqueLines.push(JSON.stringify({ lesson: "Completely different topic number " + i + " about " + ["dogs","cats","fish","birds","snakes","frogs","mice","deer","foxes","bears"][i], ts: "2026-01-0" + i }));
}
fs.writeFileSync(uniqueFile, uniqueLines.join("\n") + "\n");
var r3 = mod({ _test_lessons_path: uniqueFile, _test_escalation_path: escalationFile });
assert("Returns null when all lessons are unique", r3 === null);

// --- Test with repeated lessons (should warn) ---
var repeatFile = path.join(tmpDir, "repeat.jsonl");
var repeatLines = [];
// Same lesson 5 times (well above threshold of 3)
for (var j = 0; j < 5; j++) {
  repeatLines.push(JSON.stringify({
    lesson: "Never use polling from Claude tool calls — no loop-wait, no repeated gh api calls checking status",
    ts: "2026-01-0" + (j + 1),
    project: "hook-runner"
  }));
}
// Add some unique ones too
repeatLines.push(JSON.stringify({ lesson: "Always verify credentials before deploying", ts: "2026-01-06" }));
repeatLines.push(JSON.stringify({ lesson: "Check disk space before large operations", ts: "2026-01-07" }));
fs.writeFileSync(repeatFile, repeatLines.join("\n") + "\n");

var escalFile2 = path.join(tmpDir, "escalations2.jsonl");
// Capture stderr
var oldStderr = process.stderr.write;
var stderrOutput = "";
process.stderr.write = function(str) { stderrOutput += str; return true; };

var r4 = mod({ _test_lessons_path: repeatFile, _test_escalation_path: escalFile2 });

process.stderr.write = oldStderr; // restore

assert("Returns null (non-blocking) even with repeated lessons", r4 === null);
assert("Writes to stderr about repeated patterns", stderrOutput.indexOf("LESSON EFFECTIVENESS") >= 0);
assert("Stderr mentions the repeat count", stderrOutput.indexOf("5x") >= 0 || stderrOutput.indexOf("repeated") >= 0);
assert("Writes escalation file", fs.existsSync(escalFile2));

if (fs.existsSync(escalFile2)) {
  var escalContent = fs.readFileSync(escalFile2, "utf-8").trim();
  assert("Escalation file has content", escalContent.length > 0);
  try {
    var escalEntry = JSON.parse(escalContent.split("\n")[0]);
    assert("Escalation entry has count", typeof escalEntry.count === "number" && escalEntry.count >= 3);
    assert("Escalation entry has sample", typeof escalEntry.sample === "string" && escalEntry.sample.length > 0);
    assert("Escalation entry has projects", Array.isArray(escalEntry.projects));
  } catch(e) {
    assert("Escalation entry is valid JSON", false);
  }
}

// --- Test with empty file ---
var emptyFile = path.join(tmpDir, "empty.jsonl");
fs.writeFileSync(emptyFile, "");
var r5 = mod({ _test_lessons_path: emptyFile, _test_escalation_path: escalationFile });
assert("Returns null for empty file", r5 === null);

// Cleanup
try {
  fs.readdirSync(tmpDir).forEach(function(f) { fs.unlinkSync(path.join(tmpDir, f)); });
  fs.rmdirSync(tmpDir);
} catch(e) {}

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
