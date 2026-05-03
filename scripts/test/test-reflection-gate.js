#!/usr/bin/env node
"use strict";
// T569: Tests for reflection-gate.js
// Blocks production code edits when unresolved high/medium severity issues exist
// in self-reflection log.

var path = require("path");
var fs = require("fs");
var os = require("os");

var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "reflection-gate.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
    passed++;
  } catch (e) {
    console.log("FAIL: " + name + " — " + e.message);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// Helper to load module with a mocked reflection file
function loadGate(reflectionContent) {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reflection-gate-"));
  var reflPath = path.join(tmpDir, "self-reflection.jsonl");
  if (reflectionContent !== null) {
    fs.writeFileSync(reflPath, reflectionContent);
  }
  // Clear require cache
  delete require.cache[require.resolve(modPath)];
  // Override the REFLECTION_PATH constant by patching the file
  // Instead, we'll use a wrapper approach: read the source, replace the path
  var src = fs.readFileSync(modPath, "utf8");
  var patched = src.replace(
    /var REFLECTION_PATH = .+;/,
    'var REFLECTION_PATH = ' + JSON.stringify(reflPath.replace(/\\/g, "/")) + ';'
  );
  var tmpMod = path.join(tmpDir, "reflection-gate.js");
  fs.writeFileSync(tmpMod, patched);
  var gate = require(tmpMod);
  return { gate: gate, tmpDir: tmpDir, reflPath: reflPath };
}

function cleanup(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
}

// --- Tests ---

check("Read tool: passes (only checks Edit/Write)", function() {
  var g = loadGate(null);
  var r = g.gate({ tool_name: "Read", tool_input: { file_path: "/src/app.js" } });
  assert(r === null, "should pass");
  cleanup(g.tmpDir);
});

check("Bash tool: passes (only checks Edit/Write)", function() {
  var g = loadGate(null);
  var r = g.gate({ tool_name: "Bash", tool_input: { command: "npm test" } });
  assert(r === null, "should pass");
  cleanup(g.tmpDir);
});

check("Edit TODO.md: always allowed (exempt file)", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "bad code" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/TODO.md" } });
  assert(r === null, "TODO.md should be exempt");
  cleanup(g.tmpDir);
});

check("Edit SESSION_STATE.md: always allowed", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "bad" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/SESSION_STATE.md" } });
  assert(r === null, "SESSION_STATE.md should be exempt");
  cleanup(g.tmpDir);
});

check("Edit CLAUDE.md: always allowed", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "bad" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/CLAUDE.md" } });
  assert(r === null, "CLAUDE.md should be exempt");
  cleanup(g.tmpDir);
});

check("Edit .claude/ path: always allowed", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "bad" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/.claude/settings.json" } });
  assert(r === null, ".claude/ should be exempt");
  cleanup(g.tmpDir);
});

check("Edit specs/ path: always allowed", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "bad" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/specs/feature/tasks.md" } });
  assert(r === null, "specs/ should be exempt");
  cleanup(g.tmpDir);
});

check("Edit run-modules/ path: allowed (self-repair)", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "bad" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: os.homedir() + "/.claude/hooks/run-modules/PreToolUse/foo.js" } });
  assert(r === null, "run-modules/ should be exempt (self-repair)");
  cleanup(g.tmpDir);
});

check("Edit hook-runner/modules/ path: allowed (self-repair)", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "bad" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/hook-runner/modules/PreToolUse/gate.js" } });
  assert(r === null, "hook-runner/modules/ should be exempt (self-repair)");
  cleanup(g.tmpDir);
});

check("No reflection file: passes", function() {
  var g = loadGate(null);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/src/app.js" } });
  assert(r === null, "no file should pass");
  cleanup(g.tmpDir);
});

check("Empty reflection file: passes", function() {
  var g = loadGate("");
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/src/app.js" } });
  assert(r === null, "empty file should pass");
  cleanup(g.tmpDir);
});

check("Clean verdict: passes", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "clean", issues: [] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/src/app.js" } });
  assert(r === null, "clean verdict should pass");
  cleanup(g.tmpDir);
});

check("Resolved entry: passes", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", resolved: true, issues: [{ severity: "high", description: "fixed" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/src/app.js" } });
  assert(r === null, "resolved entry should pass");
  cleanup(g.tmpDir);
});

check("Old entry (>1hr): passes", function() {
  var old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  var entry = JSON.stringify({ ts: old, verdict: "issues", issues: [{ severity: "high", description: "stale issue" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/src/app.js" } });
  assert(r === null, "old entry should pass");
  cleanup(g.tmpDir);
});

check("Low severity: passes", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "low", description: "minor style" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/src/app.js" } });
  assert(r === null, "low severity should pass");
  cleanup(g.tmpDir);
});

check("High severity unresolved: blocks", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "security vulnerability", fix: "add validation" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/src/app.js" } });
  assert(r !== null, "should block");
  assert(r.decision === "block", "decision should be block");
  assert(r.reason.indexOf("security vulnerability") !== -1, "should mention the issue");
  assert(r.reason.indexOf("add validation") !== -1, "should include fix");
  cleanup(g.tmpDir);
});

check("Medium severity unresolved: blocks", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "medium", description: "missing tests" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/src/app.js" } });
  assert(r !== null, "should block");
  assert(r.decision === "block", "decision should be block");
  assert(r.reason.indexOf("missing tests") !== -1, "should mention the issue");
  cleanup(g.tmpDir);
});

check("Write to production file: also blocks", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "bad code" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Write", tool_input: { file_path: "/project/src/new-file.js" } });
  assert(r !== null, "Write should also block");
  assert(r.decision === "block", "decision should be block");
  cleanup(g.tmpDir);
});

check("No file_path in input: passes", function() {
  var entry = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "high", description: "bad" }] });
  var g = loadGate(entry);
  var r = g.gate({ tool_name: "Edit", tool_input: {} });
  assert(r === null, "no file_path should pass");
  cleanup(g.tmpDir);
});

check("Multiple entries: only recent unresolved count", function() {
  var old = JSON.stringify({ ts: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), verdict: "issues", issues: [{ severity: "high", description: "old" }] });
  var resolved = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", resolved: true, issues: [{ severity: "high", description: "fixed" }] });
  var active = JSON.stringify({ ts: new Date().toISOString(), verdict: "issues", issues: [{ severity: "medium", description: "active issue" }] });
  var g = loadGate(old + "\n" + resolved + "\n" + active);
  var r = g.gate({ tool_name: "Edit", tool_input: { file_path: "/project/src/app.js" } });
  assert(r !== null, "should block");
  assert(r.reason.indexOf("active issue") !== -1, "should only mention active issue");
  assert(r.reason.indexOf("old") === -1, "should not mention old issue");
  cleanup(g.tmpDir);
});

// Summary
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
