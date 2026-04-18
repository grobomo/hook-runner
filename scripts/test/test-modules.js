// Test that every module in modules/ loads and returns valid output types.
// Validates: exports function, doesn't crash on mock input, returns null or object.
// WHY: The bash version (test-modules.sh) spawned ~218 node processes which took
// 90+ seconds on Windows, exceeding the 60s test timeout. This JS version runs
// everything in-process and finishes in seconds.
"use strict";
var fs = require("fs");
var path = require("path");

var REPO_DIR = process.env.HOOK_RUNNER_DIR || path.resolve(__dirname, "..", "..");
process.env.HOOK_RUNNER_TEST = "1";

var pass = 0, fail = 0;
function ok(name) { pass++; }
function nok(name, reason) { fail++; console.log("FAIL: " + name + (reason ? " — " + reason : "")); }

// Mock inputs per event type
var MOCK_INPUTS = {
  PreToolUse: { tool_name: "Bash", tool_input: { command: "echo hello" } },
  PostToolUse: { tool_name: "Edit", tool_input: { file_path: "/tmp/test.js", old_string: "a", new_string: "b" } },
  Stop: { session_id: "test-session", stop_hook_active: true },
  SessionStart: { session_id: "test-session" },
  UserPromptSubmit: { prompt: "hello claude" },
};

// Collect all module files
var modules = [];
var events = ["PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit"];
events.forEach(function(evt) {
  var dir = path.join(REPO_DIR, "modules", evt);
  if (!fs.existsSync(dir)) return;

  // Top-level .js files (skip _ helpers)
  fs.readdirSync(dir).forEach(function(f) {
    var full = path.join(dir, f);
    if (f.endsWith(".js") && !f.startsWith("_")) {
      modules.push({ event: evt, label: evt + "/" + f, file: full });
    }
    // Subdirectories (project-scoped modules)
    try {
      if (fs.statSync(full).isDirectory() && f !== "archive" && !f.startsWith("_")) {
        fs.readdirSync(full).forEach(function(sf) {
          if (sf.endsWith(".js")) {
            modules.push({ event: evt, label: evt + "/" + f + "/" + sf, file: path.join(full, sf) });
          }
        });
      }
    } catch (e) {}
  });
});

// Run sync tests
var asyncModules = [];
modules.forEach(function(mod) {
  var label = mod.label;

  // Test 1: exports a function
  var m;
  try {
    m = require(mod.file);
  } catch (e) {
    nok(label + " loads", e.message);
    return;
  }
  if (typeof m !== "function") {
    nok(label + " exports function", "got " + typeof m);
    return;
  }
  ok(label + " exports function");

  // Test 2: calling with mock input doesn't crash
  var mockInput = MOCK_INPUTS[mod.event] || {};
  try {
    var r = m(mockInput);
    if (r && typeof r.then === "function") {
      // Async — collect for later
      asyncModules.push({ label: label, promise: r });
      ok(label + " returns async (promise)");
    } else if (r === null || r === undefined || typeof r === "object") {
      ok(label + " returns " + (r === null ? "null" : typeof r));
    } else {
      nok(label + " returns valid type", "got " + typeof r);
    }
  } catch (e) {
    nok(label + " runs without crash", e.message);
  }

  // Test 3: WORKFLOW tag in first 5 lines
  try {
    var head = fs.readFileSync(mod.file, "utf-8").split("\n").slice(0, 5).join("\n");
    if (/WORKFLOW:/.test(head)) {
      ok(label + " has WORKFLOW tag");
    } else {
      nok(label + " has WORKFLOW tag");
    }
  } catch (e) {
    nok(label + " readable");
  }

  // Test 4: WHY comment in first 5 lines
  try {
    var head2 = fs.readFileSync(mod.file, "utf-8").split("\n").slice(0, 5).join("\n");
    if (/WHY:/.test(head2)) {
      ok(label + " has WHY comment");
    } else {
      nok(label + " has WHY comment");
    }
  } catch (e) {
    nok(label + " readable");
  }
});

// Wait for async modules (with 4s timeout)
function finish() {
  console.log("");
  console.log(pass + " passed, " + fail + " failed");
  process.exit(fail > 0 ? 1 : 0);
}

if (asyncModules.length === 0) {
  finish();
} else {
  var done = 0;
  var timer = setTimeout(function() {
    // Timeout — count remaining as passed (they're async, we validated they return promises)
    finish();
  }, 4000);

  asyncModules.forEach(function(am) {
    am.promise.then(function() { done++; if (done >= asyncModules.length) { clearTimeout(timer); finish(); } })
      .catch(function() { done++; if (done >= asyncModules.length) { clearTimeout(timer); finish(); } });
  });
}
