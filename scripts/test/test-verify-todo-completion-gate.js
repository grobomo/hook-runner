#!/usr/bin/env node
// Test: verify-todo-completion-gate warns when TODO marked done but change not verified
"use strict";

var path = require("path");
var fs = require("fs");
var os = require("os");
var REPO_DIR = path.resolve(__dirname, "../..");
var MODULE = path.join(REPO_DIR, "modules/PostToolUse/verify-todo-completion-gate.js");

process.env.HOOK_RUNNER_TEST = "1";

var gate = require(MODULE);
var pass = 0, fail = 0;

function ok(label, result, expectNull) {
  var isNull = result === null || result === undefined;
  if (expectNull ? isNull : !isNull) {
    console.log("  PASS: " + label);
    pass++;
  } else {
    console.log("  FAIL: " + label + " — got " + JSON.stringify(result));
    fail++;
  }
}

function edit(filePath, oldStr, newStr) {
  return gate({
    tool_name: "Edit",
    tool_input: { file_path: filePath, old_string: oldStr, new_string: newStr }
  });
}

// Capture stderr
var stderrOutput = "";
var origWrite = process.stderr.write;
function captureStderr() { stderrOutput = ""; process.stderr.write = function(s) { stderrOutput += s; }; }
function restoreStderr() { process.stderr.write = origWrite; }

console.log("=== verify-todo-completion-gate (T782) ===");

// 1. Non-TODO.md files pass through
ok("non-TODO file passes", edit("/tmp/app.js", "old", "new"), true);

// 2. TODO.md edit without completion passes
ok("TODO edit without completion passes", edit("/tmp/TODO.md", "some text", "updated text"), true);

// 3. TODO completion without file refs passes (no claims to verify)
ok("completion without file refs passes",
  edit("/tmp/TODO.md",
    "- [ ] T100: **Fix something** — Did a thing",
    "- [x] T100: **Fix something** — Did a thing"),
  true);

// 4. TODO completion with existing file ref — should pass silently
// Create a temp file to reference
var tmpDir = os.tmpdir();
var tmpFile = path.join(tmpDir, "test-verify-gate-target.yaml");
fs.writeFileSync(tmpFile, "rules:\n  - name: test-rule\n    check: \"test check\"\n");
captureStderr();
ok("completion with verifiable file ref passes",
  edit("/tmp/TODO.md",
    "- [ ] T101: **Fix rule** — Updated `test-rule` in " + tmpFile,
    "- [x] T101: **Fix rule** — Updated `test-rule` in " + tmpFile),
  true);
var hadNoWarning = stderrOutput.indexOf("WARNING") === -1;
restoreStderr();
if (hadNoWarning) { console.log("  PASS: no warning when content verified"); pass++; }
else { console.log("  FAIL: unexpected warning: " + stderrOutput); fail++; }

// 5. TODO completion referencing non-existent file — should warn
captureStderr();
ok("completion with missing file ref returns null (non-blocking)",
  edit("/tmp/TODO.md",
    "- [ ] T102: **Add gate** — Created `nonexistent-gate.js` with 20 tests",
    "- [x] T102: **Add gate** — Created `nonexistent-gate.js` with 20 tests"),
  true);
var hadWarning = stderrOutput.indexOf("WARNING") !== -1 && stderrOutput.indexOf("nonexistent-gate.js") !== -1;
restoreStderr();
if (hadWarning) { console.log("  PASS: warns about missing file"); pass++; }
else { console.log("  FAIL: should warn about nonexistent-gate.js: " + stderrOutput); fail++; }

// 6. TODO completion with wrong content in file — should warn
fs.writeFileSync(tmpFile, "rules:\n  - name: old-rule\n    check: \"old check\"\n");
captureStderr();
edit("/tmp/TODO.md",
  "- [ ] T103: **Update rule** — Changed `new-rule-name` in " + tmpFile,
  "- [x] T103: **Update rule** — Changed `new-rule-name` in " + tmpFile);
var hadContentWarn = stderrOutput.indexOf("WARNING") !== -1 && stderrOutput.indexOf("new-rule-name") !== -1;
restoreStderr();
if (hadContentWarn) { console.log("  PASS: warns when expected content missing from file"); pass++; }
else { console.log("  FAIL: should warn about missing content: " + stderrOutput); fail++; }

// 7. Non-Edit tools pass through
ok("Write tool passes", gate({ tool_name: "Write", tool_input: { file_path: "/tmp/TODO.md", content: "- [x] done" } }), true);
ok("Bash tool passes", gate({ tool_name: "Bash", tool_input: { command: "echo hi" } }), true);

// 8. Marking TODO as incomplete (removing [x]) passes
ok("unchecking TODO passes", edit("/tmp/TODO.md",
  "- [x] T104: **Something** — done",
  "- [ ] T104: **Something** — not done yet"), true);

// 9. Multiple file refs — warns about each missing one
captureStderr();
edit("/tmp/TODO.md",
  "- [ ] T105: **Multi-file fix** — Updated `missing1.js` and `missing2.yaml` with changes",
  "- [x] T105: **Multi-file fix** — Updated `missing1.js` and `missing2.yaml` with changes");
var warnBoth = stderrOutput.indexOf("missing1.js") !== -1 && stderrOutput.indexOf("missing2.yaml") !== -1;
restoreStderr();
if (warnBoth) { console.log("  PASS: warns about all missing files"); pass++; }
else { console.log("  FAIL: should warn about both files: " + stderrOutput); fail++; }

// Cleanup
try { fs.unlinkSync(tmpFile); } catch(e) {}

console.log("\n=== Results: " + pass + " passed, " + fail + " failed ===");
process.exit(fail > 0 ? 1 : 0);
