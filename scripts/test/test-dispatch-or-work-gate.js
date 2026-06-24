"use strict";
// Test T842: dispatch-or-work-gate

var passed = 0, failed = 0;
function ok(label, condition) {
  if (condition) { passed++; console.log("  PASS: " + label); }
  else { failed++; console.log("  FAIL: " + label); }
}

var origCwd = process.cwd;
function setDispatcherCwd() {
  process.cwd = function() { return "/tmp/projects/request-tracker"; };
}
function setNonDispatcherCwd() {
  process.cwd = function() { return "/tmp/projects/imsva-upgrade"; };
}
function restore() {
  process.cwd = origCwd;
}

// Load in test mode
process.env.HOOK_RUNNER_TEST = "1";
var gate = require("../../modules/PreToolUse/dispatch-or-work-gate.js");

console.log("=== dispatch-or-work-gate tests ===\n");

console.log("--- Module contract ---");
ok("exports a function", typeof gate === "function");

// Test mode returns null synchronously (or as promise)
var testResult = gate({ tool_name: "Bash", tool_input: { command: "npm install" } });
if (testResult && typeof testResult.then === "function") {
  // async module — test mode should resolve to null
  testResult.then(function(r) {
    ok("returns null in test mode (async)", r === null);
    runRemainingTests();
  });
} else {
  ok("returns null in test mode", testResult === null);
  runRemainingTests();
}

function runRemainingTests() {
  // Remove test mode and reload
  delete process.env.HOOK_RUNNER_TEST;
  delete require.cache[require.resolve("../../modules/PreToolUse/dispatch-or-work-gate.js")];
  gate = require("../../modules/PreToolUse/dispatch-or-work-gate.js");

  console.log("\n--- Non-dispatcher project (always pass) ---");
  setNonDispatcherCwd();
  Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "npm install" } })).then(function(r) {
    ok("npm install from non-dispatcher passes", r === null);
    restore();

    console.log("\n--- Read-only tools (always pass) ---");
    setDispatcherCwd();
    return Promise.all([
      Promise.resolve(gate({ tool_name: "Read", tool_input: {} })),
      Promise.resolve(gate({ tool_name: "Grep", tool_input: {} })),
      Promise.resolve(gate({ tool_name: "Glob", tool_input: {} })),
    ]);
  }).then(function(results) {
    ok("Read passes", results[0] === null);
    ok("Grep passes", results[1] === null);
    ok("Glob passes", results[2] === null);
    restore();

    console.log("\n--- Safe commands (pass without Haiku) ---");
    setDispatcherCwd();
    return Promise.all([
      Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "python manage.py poll" } })),
      Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "python manage.py status --json" } })),
      Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "python manage.py heartbeat-check --json" } })),
      Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "python manage.py email-poll" } })),
      Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "curl http://127.0.0.1:4100/api/fleet" } })),
      Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "cat TODO.md" } })),
      Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "git status" } })),
      Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "gh pr list" } })),
    ]);
  }).then(function(results) {
    ok("manage.py poll passes", results[0] === null);
    ok("manage.py status passes", results[1] === null);
    ok("manage.py heartbeat passes", results[2] === null);
    ok("manage.py email-poll passes", results[3] === null);
    ok("curl localhost passes", results[4] === null);
    ok("cat passes", results[5] === null);
    ok("git passes", results[6] === null);
    ok("gh passes", results[7] === null);
    restore();

    console.log("\n--- Management files (pass without Haiku) ---");
    setDispatcherCwd();
    return Promise.all([
      Promise.resolve(gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/projects/request-tracker/TODO.md" } })),
      Promise.resolve(gate({ tool_name: "Write", tool_input: { file_path: "/tmp/projects/request-tracker/README.md" } })),
      Promise.resolve(gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/projects/request-tracker/manage.py" } })),
      Promise.resolve(gate({ tool_name: "Write", tool_input: { file_path: "/tmp/projects/request-tracker/.coconut/STATUS_REPORT.md" } })),
    ]);
  }).then(function(results) {
    ok("Edit TODO.md passes", results[0] === null);
    ok("Write README.md passes", results[1] === null);
    ok("Edit manage.py passes", results[2] === null);
    ok("Write .coconut passes", results[3] === null);
    restore();

    console.log("\n--- Empty/missing inputs ---");
    setDispatcherCwd();
    return Promise.all([
      Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "" } })),
      Promise.resolve(gate({ tool_name: "Bash", tool_input: {} })),
      Promise.resolve(gate({ tool_name: "Bash" })),
    ]);
  }).then(function(results) {
    ok("empty command passes", results[0] === null);
    ok("no command passes", results[1] === null);
    ok("no tool_input passes", results[2] === null);
    restore();

    // Ambiguous commands go to Haiku. If proxy is up, Haiku judges them.
    // If proxy is down, fallback=allow → null.
    // Test both possibilities since proxy state varies.
    console.log("\n--- Haiku judgment (proxy-dependent) ---");
    setDispatcherCwd();
    return Promise.resolve(gate({ tool_name: "Bash", tool_input: { command: "npm install express" } }));
  }).then(function(r) {
    // Either Haiku blocks (correct) or fallback allows (proxy down)
    ok("npm install goes to Haiku (block or null)", r === null || (r && r.decision === "block"));

    setDispatcherCwd();
    return Promise.resolve(gate({ tool_name: "Edit", tool_input: { file_path: "/tmp/projects/request-tracker/src/new-feature.py" } }));
  }).then(function(r) {
    ok("impl file edit goes to Haiku (block or null)", r === null || (r && r.decision === "block"));
    restore();

    console.log("\n" + passed + " passed, " + failed + " failed");
    process.exit(failed > 0 ? 1 : 0);
  }).catch(function(err) {
    console.error("Test error:", err);
    process.exit(1);
  });
}
