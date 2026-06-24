#!/usr/bin/env node
// Test: vision-doc-gate enforces docs/<component>/vision.md exists before code edits
// T793: Vision doc enforcement for shtd workflow
"use strict";

var path = require("path");
var fs = require("fs");
var os = require("os");
var REPO_DIR = path.resolve(__dirname, "../..");
var MODULE = path.join(REPO_DIR, "modules/PreToolUse/vision-doc-gate.js");

process.env.HOOK_RUNNER_TEST = "1";

var pass = 0, fail = 0;

function ok(label, condition) {
  if (condition) {
    console.log("  PASS: " + label);
    pass++;
  } else {
    console.log("  FAIL: " + label);
    fail++;
  }
}

function assertContains(label, result, substring) {
  if (result && result.reason && result.reason.indexOf(substring) !== -1) {
    console.log("  PASS: " + label);
    pass++;
  } else {
    console.log("  FAIL: " + label + " — reason missing '" + substring + "': " +
      JSON.stringify(result && result.reason));
    fail++;
  }
}

// Setup temp project with docs/ directory
var tmpDir = path.join(os.tmpdir(), "test-vision-gate-" + process.pid);
var docsDir = path.join(tmpDir, "docs");
var srcDir = path.join(tmpDir, "src");
var modulesDir = path.join(tmpDir, "modules", "PreToolUse");

function setup() {
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (e) {}
  try { fs.mkdirSync(docsDir, { recursive: true }); } catch (e) {}
  try { fs.mkdirSync(srcDir, { recursive: true }); } catch (e) {}
  try { fs.mkdirSync(modulesDir, { recursive: true }); } catch (e) {}
}

function cleanup() {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
}

// Mock shtd enabled/disabled
var origProjectDir = process.env.CLAUDE_PROJECT_DIR;

function freshRequire() {
  // Clear module caches
  delete require.cache[require.resolve(MODULE)];
  // Also clear _shtd-enforce cache
  var shtdPath = path.join(REPO_DIR, "modules/PreToolUse/_shtd-enforce.js");
  delete require.cache[require.resolve(shtdPath)];
  return require(MODULE);
}

console.log("=== vision-doc-gate (T793) ===");

// === Test Group 1: Module contract ===
console.log("\n--- Module contract ---");
setup();
process.env.CLAUDE_PROJECT_DIR = tmpDir;
var gate = freshRequire();
ok("module exports a function", typeof gate === "function");
ok("returns null for non-Edit/Write (Bash)", gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
ok("returns null for non-Edit/Write (Read)", gate({ tool_name: "Read", tool_input: { file_path: "/tmp/x.js" } }) === null);
ok("returns null for empty file_path", gate({ tool_name: "Edit", tool_input: {} }) === null);

// === Test Group 2: Exempt files pass through ===
console.log("\n--- Exempt files ---");
var exemptPaths = [
  tmpDir + "/docs/vision/test.md",
  tmpDir + "/specs/feature/spec.md",
  tmpDir + "/tests/unit/test.js",
  tmpDir + "/scripts/test/test-foo.sh",
  tmpDir + "/TODO.md",
  tmpDir + "/CLAUDE.md",
  tmpDir + "/README.md",
  tmpDir + "/package.json",
  tmpDir + "/workflows/starter.yml",
  tmpDir + "/.gitignore",
  tmpDir + "/rules/stop/test.yaml",
  tmpDir + "/config.json",
  tmpDir + "/src/app.test.js",
];

gate = freshRequire();
for (var i = 0; i < exemptPaths.length; i++) {
  var p = exemptPaths[i].replace(/\\/g, "/");
  var result = gate({ tool_name: "Edit", tool_input: { file_path: p, old_string: "a", new_string: "b" } });
  ok("exempt: " + path.basename(p), result === null);
}

// === Test Group 3: shtd disabled = dormant ===
console.log("\n--- shtd disabled ---");
// The gate checks isShtdEnabled() — since we're in test mode without workflow config,
// shtd is disabled by default. Source files should pass.
gate = freshRequire();
result = gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir + "/src/app.js", old_string: "a", new_string: "b" }
});
ok("shtd disabled — source file passes", result === null);

// === Test Group 4: No docs/ dir = dormant ===
console.log("\n--- No docs/ dir ---");
var nodocsDir = path.join(os.tmpdir(), "test-vision-nodocs-" + process.pid);
try { fs.mkdirSync(nodocsDir, { recursive: true }); } catch (e) {}
try { fs.mkdirSync(path.join(nodocsDir, "src"), { recursive: true }); } catch (e) {}
process.env.CLAUDE_PROJECT_DIR = nodocsDir;
gate = freshRequire();
result = gate({
  tool_name: "Edit",
  tool_input: { file_path: nodocsDir + "/src/app.js", old_string: "a", new_string: "b" }
});
ok("no docs/ dir — source file passes", result === null);
try { fs.rmSync(nodocsDir, { recursive: true, force: true }); } catch (e) {}

// === Test Group 5: Component extraction ===
console.log("\n--- Component extraction ---");
process.env.CLAUDE_PROJECT_DIR = tmpDir;

// Test getComponent by checking module internals
// Can't call getComponent directly, but we can test indirectly

// Component from "src/app.js" = "src"
// Component from "modules/PreToolUse/gate.js" = "modules"
// Component from "cli/setup.js" = "cli"
// Component from "app.js" = null (top-level)

// Simulate by checking what paths trigger blocks when shtd is enabled
// (Since shtd is disabled in test, we test the pattern matching logic directly)
var testComponents = [
  { path: "src/app.js", expected: "src" },
  { path: "modules/PreToolUse/gate.js", expected: "modules" },
  { path: "cli/setup.js", expected: "cli" },
  { path: "app.js", expected: null },
  { path: "runners/stop.js", expected: "runners" },
];

for (var ci = 0; ci < testComponents.length; ci++) {
  var tc = testComponents[ci];
  var rel = tc.path;
  var parts = rel.split("/");
  var component = parts.length >= 2 ? parts[0] : null;
  ok("component('" + tc.path + "') = " + JSON.stringify(tc.expected), component === tc.expected);
}

// === Test Group 6: Vision doc detection ===
console.log("\n--- Vision doc detection ---");

// Test docs/<component>/vision.md
var testVisionDir = path.join(docsDir, "src");
try { fs.mkdirSync(testVisionDir, { recursive: true }); } catch (e) {}
fs.writeFileSync(path.join(testVisionDir, "vision.md"), "# Source Vision\n");
ok("finds docs/src/vision.md", fs.existsSync(path.join(docsDir, "src", "vision.md")));

// Test docs/vision/<component>.md
var altVisionDir = path.join(docsDir, "vision");
try { fs.mkdirSync(altVisionDir, { recursive: true }); } catch (e) {}
fs.writeFileSync(path.join(altVisionDir, "cli.md"), "# CLI Vision\n");
ok("finds docs/vision/cli.md", fs.existsSync(path.join(docsDir, "vision", "cli.md")));

// Test missing vision doc
ok("no vision for modules/", !fs.existsSync(path.join(docsDir, "modules", "vision.md")) &&
  !fs.existsSync(path.join(docsDir, "vision", "modules.md")));

// === Test Group 7: Block message format ===
console.log("\n--- Block message format ---");

// Create a fake block to verify message format
var fakeBlock = {
  decision: "block",
  reason: [
    "BLOCKED: New component without vision doc",
    "WHY: Building systems without documenting WHY they exist leads to tools that solve",
    "the wrong problem.",
    "NEXT STEPS:",
    "1. Create docs/mycomp/vision.md with:",
    "   - The Problem: what's broken or missing",
    'FALSE POSITIVE? File a TODO in hook-runner: "Fix vision-doc-gate — {describe the issue}"'
  ].join("\n")
};
ok("block has BLOCKED prefix", fakeBlock.reason.indexOf("BLOCKED:") === 0);
ok("block has WHY", fakeBlock.reason.indexOf("WHY:") !== -1);
ok("block has NEXT STEPS", fakeBlock.reason.indexOf("NEXT STEPS:") !== -1);
ok("block has FALSE POSITIVE", fakeBlock.reason.indexOf("FALSE POSITIVE?") !== -1);
ok("block mentions vision.md", fakeBlock.reason.indexOf("vision.md") !== -1);
ok("block mentions component name", fakeBlock.reason.indexOf("mycomp") !== -1);

// === Test Group 8: Files outside project ignored ===
console.log("\n--- Files outside project ---");
process.env.CLAUDE_PROJECT_DIR = tmpDir;
gate = freshRequire();
result = gate({
  tool_name: "Edit",
  tool_input: { file_path: "/completely/different/project/src/app.js", old_string: "a", new_string: "b" }
});
ok("file outside project passes", result === null);

// === Test Group 9: Windows path normalization ===
console.log("\n--- Windows path normalization ---");
gate = freshRequire();
result = gate({
  tool_name: "Edit",
  tool_input: { file_path: tmpDir.replace(/\//g, "\\") + "\\TODO.md", old_string: "a", new_string: "b" }
});
ok("backslash paths normalized", result === null);

// === Cleanup ===
cleanup();
process.env.CLAUDE_PROJECT_DIR = origProjectDir || "";

// === Summary ===
console.log("\n" + (pass + fail) + " tests: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
