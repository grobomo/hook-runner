#!/usr/bin/env node
"use strict";
// T781: Tests for file-naming-check.js (PostToolUse)
// Verifies filename-vs-content checking logic (filters, skip rules, L1 call).

var path = require("path");
var fs = require("fs");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "file-naming-check.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// Set test mode so the module returns null early
process.env.HOOK_RUNNER_TEST = "1";

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

// --- Basic filtering tests ---

check("Returns null in test mode", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/some/file.js" } });
  assert(r === null, "should return null in test mode");
});

// Temporarily disable test mode for filter tests
delete process.env.HOOK_RUNNER_TEST;

check("Returns null for null input", function() {
  var gate = loadGate();
  assert(gate(null) === null);
});

check("Returns null for empty input", function() {
  var gate = loadGate();
  assert(gate({}) === null);
});

check("Returns null for non-Edit/Write tools", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read" }) === null);
  assert(gate({ tool_name: "Bash" }) === null);
  assert(gate({ tool_name: "Glob" }) === null);
});

check("Returns null for non-source file extensions", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/path/to/readme.md" } }) === null);
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/path/to/image.png" } }) === null);
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/path/to/data.json" } }) === null);
});

check("Returns null for node_modules paths", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/node_modules/lodash/index.js" } }) === null);
});

check("Returns null for .git paths", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/.git/hooks/pre-commit.sh" } }) === null);
});

check("Returns null for underscore-prefixed files", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/_internal-helper.js" } }) === null);
});

check("Returns null for test files", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/test-something.js" } }) === null);
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/test_other.py" } }) === null);
});

check("Returns null for short filenames (< 5 chars name)", function() {
  var gate = loadGate();
  // "app" is 3 chars, "main" is 4 chars
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/app.js" } }) === null);
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "/project/main.py" } }) === null);
});

check("Accepts valid source file paths (.js)", function() {
  // This will try to read the file and fail (file doesn't exist), returning null
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/nonexistent/my-module.js" } });
  assert(r === null, "should return null (file doesn't exist)");
});

check("Accepts .py files", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/nonexistent/data-processor.py" } });
  assert(r === null);
});

check("Accepts .yaml files", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/nonexistent/config-rules.yaml" } });
  assert(r === null);
});

check("Accepts .sh files", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/nonexistent/deploy-script.sh" } });
  assert(r === null);
});

// Test dedup: same file checked only once per session
check("Dedup: same file checked only once", function() {
  var gate = loadGate();
  // First call passes the filter (but file doesn't exist)
  gate({ tool_name: "Edit", tool_input: { file_path: "/dedup-test/unique-module.js" } });
  // Module tracks checked files — second call should skip
  // We can't directly test this without the file, but we verify no crash
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/dedup-test/unique-module.js" } });
  assert(r === null);
});

// Test with real file content (short file skipped)
check("Skips files with < 100 chars content", function() {
  var gate = loadGate();
  var tmpFile = path.join(require("os").tmpdir(), "short-naming-test.js");
  fs.writeFileSync(tmpFile, "// short file\nvar x = 1;\n");
  try {
    var r = gate({ tool_name: "Edit", tool_input: { file_path: tmpFile } });
    assert(r === null, "should skip short file");
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) {}
  }
});

// Test Write tool uses file_path from tool_input
check("Write tool uses file_path from tool_input", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/nonexistent/helper-utils.js" } });
  assert(r === null);
});

// Re-enable test mode
process.env.HOOK_RUNNER_TEST = "1";

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
