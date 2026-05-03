#!/usr/bin/env node
"use strict";
// T584: Tests for test-coverage-check.js (PostToolUse)
// Warns when source files are modified but existing test files aren't run.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "test-coverage-check.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var tmpDir = path.join(os.tmpdir(), "test-coverage-check-" + Date.now());
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function setupProject(structure) {
  // structure: { "scripts/test/test-foo.js": "", "src/foo.js": "" }
  var projDir = path.join(tmpDir, "proj-" + Date.now());
  for (var relPath in structure) {
    var absPath = path.join(projDir, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, structure[relPath] || "");
  }
  process.env.CLAUDE_PROJECT_DIR = projDir;
  return projDir;
}

function restore() {
  if (origProjectDir !== undefined) process.env.CLAUDE_PROJECT_DIR = origProjectDir;
  else delete process.env.CLAUDE_PROJECT_DIR;
}

// --- Non-applicable inputs ---

check("Non-Edit/Write tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
  restore();
});

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "/src/index.js" } }) === null);
  restore();
});

check("Empty file_path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "" } }) === null);
  restore();
});

// --- Test files: passes (no reminder for editing test files) ---

check("test- prefix file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/test-foo.js" } }) === null);
  restore();
});

check("test_ prefix file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "/project/test_bar.py" } }) === null);
  restore();
});

check(".test.js suffix: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/src/module.test.js" } }) === null);
  restore();
});

check(".spec.ts suffix: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/src/module.spec.ts" } }) === null);
  restore();
});

check("_test.go suffix: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/pkg/handler_test.go" } }) === null);
  restore();
});

check("File in scripts/test/ dir: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/scripts/test/helper.js" } }) === null);
  restore();
});

check("File in __tests__/ dir: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/__tests__/something.js" } }) === null);
  restore();
});

// --- Non-code files: passes ---

check(".md file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/README.md" } }) === null);
  restore();
});

check(".json file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/package.json" } }) === null);
  restore();
});

check(".yml file: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "/project/config.yml" } }) === null);
  restore();
});

// --- Source file with matching test: blocks ---

check("Source file with test in scripts/test/: blocks", function() {
  var proj = setupProject({
    "scripts/test/test-foo.js": "// test",
    "src/foo.js": "// source"
  });
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(proj, "src", "foo.js") } });
  restore();
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("foo.js") !== -1);
  assert(r.reason.indexOf("test-foo.js") !== -1);
});

check("Source file with test in test/ dir: blocks", function() {
  var proj = setupProject({
    "test/test-bar.js": "// test",
    "lib/bar.js": "// source"
  });
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(proj, "lib", "bar.js") } });
  restore();
  assert(r !== null, "should block");
  assert(r.reason.indexOf("bar.js") !== -1);
});

// --- Source file without matching test: passes ---

check("Source file with no matching test: passes", function() {
  var proj = setupProject({
    "scripts/test/test-other.js": "// test for something else",
    "src/unique.js": "// no test"
  });
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(proj, "src", "unique.js") } });
  restore();
  assert(r === null, "should pass when no matching test exists");
});

// --- Sibling test detection ---

check("Sibling .test.js file: blocks", function() {
  var proj = setupProject({
    "src/utils.js": "// source",
    "src/utils.test.js": "// test"
  });
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: path.join(proj, "src", "utils.js") } });
  restore();
  assert(r !== null, "should detect sibling test");
  assert(r.reason.indexOf("utils.test.js") !== -1);
});

// --- Missing tool_input ---

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit" }) === null);
  restore();
});

// --- Cleanup ---
try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
restore();

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
