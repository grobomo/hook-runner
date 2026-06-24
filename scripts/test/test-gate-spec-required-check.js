#!/usr/bin/env node
"use strict";
// Tests for gate-spec-required-check.js (T817)
// Verifies: warns when behavioral TODO lacks gate spec

var fs = require("fs");
var path = require("path");
var os = require("os");

var passed = 0, failed = 0;
function ok(label, cond) {
  if (cond) { passed++; console.log("  PASS:", label); }
  else { failed++; console.error("  FAIL:", label); }
}

// Isolate
var origHome = process.env.HOME;
process.env.HOME = os.tmpdir();

var gate = require("../../modules/PostToolUse/gate-spec-required-check");

console.log("=== T817: gate-spec-required-check ===\n");

// --- Module contract ---
console.log("--- Module contract ---");
ok("exports a function", typeof gate === "function");
ok("ignores non-Edit/Write", gate({ tool_name: "Bash", tool_input: {} }) === null);
ok("ignores non-TODO files", gate({
  tool_name: "Edit",
  tool_input: { file_path: "/foo/bar.js", new_string: "always enforce never block" }
}) === null);

// --- Behavioral TODO without gate spec (warn) ---
console.log("\n--- Behavioral without gate spec ---");
var r1 = gate({
  tool_name: "Edit",
  tool_input: {
    file_path: "/project/TODO.md",
    new_string: "- [ ] T999: Always enforce that Claude must never skip TODO entries before starting work. Check when user gives a task."
  }
});
ok("warns on behavioral TODO without gate spec", r1 !== null);
ok("warning mentions gate spec", r1 && /gate spec/.test(r1.reason));
ok("warning mentions event types", r1 && /PreToolUse/.test(r1.reason));

// --- Behavioral TODO WITH gate spec (pass) ---
console.log("\n--- Behavioral with gate spec ---");
var r2 = gate({
  tool_name: "Edit",
  tool_input: {
    file_path: "/project/TODO.md",
    new_string: "- [ ] T999: Always enforce TODO-first. PreToolUse gate blocks Edit/Write until TODO.md updated. Block message: BLOCKED: Must track in TODO first. FALSE POSITIVE?"
  }
});
ok("passes behavioral TODO with gate spec", r2 === null);

// --- Non-behavioral TODO (pass) ---
console.log("\n--- Non-behavioral TODO ---");
ok("passes feature TODO", gate({
  tool_name: "Edit",
  tool_input: {
    file_path: "/project/TODO.md",
    new_string: "- [ ] T999: Add pagination to the user list endpoint"
  }
}) === null);

ok("passes bug fix TODO", gate({
  tool_name: "Edit",
  tool_input: {
    file_path: "/project/TODO.md",
    new_string: "- [ ] T999: Fix the login page rendering on mobile browsers"
  }
}) === null);

// --- Edge cases ---
console.log("\n--- Edge cases ---");
ok("passes empty content", gate({
  tool_name: "Edit",
  tool_input: { file_path: "/project/TODO.md", new_string: "" }
}) === null);

ok("passes short content", gate({
  tool_name: "Edit",
  tool_input: { file_path: "/project/TODO.md", new_string: "always never" }
}) === null);

ok("passes null tool_input", gate({
  tool_name: "Edit",
  tool_input: null
}) === null);

// --- Write tool ---
console.log("\n--- Write tool ---");
var r3 = gate({
  tool_name: "Write",
  tool_input: {
    file_path: "/project/TODO.md",
    content: "- [ ] T999: Must enforce that Claude always blocks when detecting harmful patterns. Prevent any bypass. Check when user submits."
  }
});
ok("warns on Write with behavioral content", r3 !== null);

// --- Single behavioral keyword (below threshold) ---
console.log("\n--- Threshold ---");
ok("passes with only one behavioral keyword", gate({
  tool_name: "Edit",
  tool_input: {
    file_path: "/project/TODO.md",
    new_string: "- [ ] T999: Always update the changelog when releasing a version"
  }
}) === null);

// --- Mixed: behavioral + partial gate spec (still warns) ---
console.log("\n--- Partial gate spec ---");
var r4 = gate({
  tool_name: "Edit",
  tool_input: {
    file_path: "/project/TODO.md",
    new_string: "- [ ] T999: Always enforce this rule. Block when Claude does not check. This should be a PreToolUse module."
  }
});
ok("warns with only 1 gate spec indicator (needs 2)", r4 !== null);

// --- Case insensitive path ---
console.log("\n--- Path matching ---");
var r5 = gate({
  tool_name: "Edit",
  tool_input: {
    file_path: "/project/todo.md",
    new_string: "- [ ] T999: Must always enforce and never bypass the check when it runs each time."
  }
});
ok("matches todo.md case-insensitively", r5 !== null);

// Cleanup
process.env.HOME = origHome;

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
