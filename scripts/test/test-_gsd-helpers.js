#!/usr/bin/env node
"use strict";
// Tests for _gsd-helpers.js — getActivePhases() parses ROADMAP.md for active milestone phases.
var path = require("path");
var fs = require("fs");
var os = require("os");
var helpers = require(path.join(__dirname, "..", "..", "modules", "PreToolUse", "_gsd-helpers.js"));

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("OK: " + msg); }
  else { failed++; console.error("FAIL: " + msg); }
}

var tmpDir;
function setup() {
  tmpDir = path.join(os.tmpdir(), "gsd-helpers-test-" + Date.now());
  fs.mkdirSync(path.join(tmpDir, ".planning"), { recursive: true });
}
function teardown() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
}

// === Contract ===
assert(typeof helpers === "object", "Exports an object");
assert(typeof helpers.getActivePhases === "function", "Has getActivePhases function");

// === No .planning directory ===
assert(helpers.getActivePhases("/nonexistent/path").length === 0, "Returns [] for missing dir");

// === No ROADMAP.md ===
setup();
assert(helpers.getActivePhases(tmpDir).length === 0, "Returns [] when ROADMAP.md missing");
teardown();

// === Empty ROADMAP.md ===
setup();
fs.writeFileSync(path.join(tmpDir, ".planning", "ROADMAP.md"), "# Roadmap\n");
assert(helpers.getActivePhases(tmpDir).length === 0, "Returns [] for empty roadmap");
teardown();

// === Single active phase ===
setup();
fs.writeFileSync(path.join(tmpDir, ".planning", "ROADMAP.md"), [
  "# Roadmap",
  "## Active Milestone",
  "### Phase 1 — Setup",
  "- Task A",
  "## Completed",
  "### Phase 0 — Init"
].join("\n"));
var result = helpers.getActivePhases(tmpDir);
assert(result.length === 1, "Single phase: returns 1 phase");
assert(result[0] === "1", "Single phase: phase number is '1'");
teardown();

// === Multiple active phases ===
setup();
fs.writeFileSync(path.join(tmpDir, ".planning", "ROADMAP.md"), [
  "# Roadmap",
  "## Active Milestone",
  "### Phase 3 — Build",
  "- Task X",
  "### Phase 4 — Test",
  "- Task Y",
  "### Phase 5 — Deploy",
  "- Task Z",
  "## Archived"
].join("\n"));
result = helpers.getActivePhases(tmpDir);
assert(result.length === 3, "Multiple phases: returns 3 phases");
assert(result[0] === "3" && result[1] === "4" && result[2] === "5", "Multiple phases: correct numbers [3,4,5]");
teardown();

// === Phases only in Completed section (not active) ===
setup();
fs.writeFileSync(path.join(tmpDir, ".planning", "ROADMAP.md"), [
  "# Roadmap",
  "## Completed",
  "### Phase 1 — Done",
  "### Phase 2 — Done"
].join("\n"));
assert(helpers.getActivePhases(tmpDir).length === 0, "No active section: returns []");
teardown();

// === Case insensitive Active Milestone header ===
setup();
fs.writeFileSync(path.join(tmpDir, ".planning", "ROADMAP.md"), [
  "# Roadmap",
  "## active milestone",
  "### Phase 10 — Big Feature"
].join("\n"));
result = helpers.getActivePhases(tmpDir);
assert(result.length === 1, "Case insensitive: finds phase");
assert(result[0] === "10", "Case insensitive: phase number is '10'");
teardown();

// === Stops at next H2 section ===
setup();
fs.writeFileSync(path.join(tmpDir, ".planning", "ROADMAP.md"), [
  "# Roadmap",
  "## Active Milestone",
  "### Phase 7 — Active",
  "## Backlog",
  "### Phase 8 — Future"
].join("\n"));
result = helpers.getActivePhases(tmpDir);
assert(result.length === 1, "Section boundary: stops at next H2");
assert(result[0] === "7", "Section boundary: only phase 7");
teardown();

// === H3 subsections inside phases don't break parsing ===
setup();
fs.writeFileSync(path.join(tmpDir, ".planning", "ROADMAP.md"), [
  "# Roadmap",
  "## Active Milestone",
  "### Phase 2 — Work",
  "#### Sub-task details",
  "- Stuff",
  "### Phase 3 — More Work"
].join("\n"));
result = helpers.getActivePhases(tmpDir);
assert(result.length === 2, "H4 subsections: still finds both phases");
assert(result[0] === "2" && result[1] === "3", "H4 subsections: phases 2 and 3");
teardown();

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
