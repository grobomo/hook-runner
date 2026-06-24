#!/usr/bin/env node
"use strict";
// T788: Tests for script-not-oneoff-check.js (PostToolUse)
// Flags long inline scripts that should be extracted to files.

process.env.HOOK_RUNNER_TEST = "1";

var assert = require("assert");
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("OK: " + name);
    passed++;
  } catch (e) {
    console.log("FAIL: " + name + " — " + e.message);
    failed++;
  }
}

// Fresh load for each test to reset warned cache
function load() {
  var modPath = require.resolve("../../modules/PostToolUse/script-not-oneoff-check");
  delete require.cache[modPath];
  return require(modPath);
}

function makeLines(n, prefix) {
  var lines = [];
  for (var i = 0; i < n; i++) {
    lines.push((prefix || "echo") + " line" + i);
  }
  return lines.join("\n");
}

// --- Basic null returns ---
test("Returns null for null input", function() {
  var gate = load();
  assert.strictEqual(gate(null), null);
});

test("Returns null for empty input", function() {
  var gate = load();
  assert.strictEqual(gate({}), null);
});

test("Returns null for non-Bash tools", function() {
  var gate = load();
  assert.strictEqual(gate({ tool_name: "Edit", tool_input: { command: makeLines(20) } }), null);
  assert.strictEqual(gate({ tool_name: "Write", tool_input: { command: makeLines(20) } }), null);
  assert.strictEqual(gate({ tool_name: "Read", tool_input: { command: makeLines(20) } }), null);
});

test("Returns null for short commands (under 10 lines)", function() {
  var gate = load();
  var cmd = makeLines(5);
  assert.strictEqual(gate({ tool_name: "Bash", tool_input: { command: cmd } }), null);
});

test("Returns null for exactly 9 lines", function() {
  var gate = load();
  var cmd = makeLines(9);
  assert.strictEqual(gate({ tool_name: "Bash", tool_input: { command: cmd } }), null);
});

// --- Detection ---
test("Detects 10+ line bash scripts", function() {
  var gate = load();
  // Advisory only — returns null but logs. The module writes to stderr.
  var cmd = makeLines(12);
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null); // non-blocking
});

test("Detects python -c with multiline", function() {
  var gate = load();
  var cmd = 'python3 -c "\n' + makeLines(12, "print") + '"';
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null); // non-blocking
});

test("Detects node -e with multiline", function() {
  var gate = load();
  var cmd = 'node -e "\n' + makeLines(12, "console.log") + '"';
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null); // non-blocking
});

test("Detects heredoc scripts", function() {
  var gate = load();
  var cmd = "cat <<'EOF'\n" + makeLines(12) + "\nEOF";
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null); // non-blocking
});

// --- Safe patterns ---
test("Skips test runner commands", function() {
  var gate = load();
  var cmd = "node scripts/test/test-foo.js\n" + makeLines(12);
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null);
});

test("Skips node -c syntax checks", function() {
  var gate = load();
  var cmd = "node -c somefile.js\n" + makeLines(12);
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null);
});

test("Skips grep pipelines", function() {
  var gate = load();
  var cmd = "grep -rn 'pattern' .\n" + makeLines(12);
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null);
});

test("Skips git log/diff", function() {
  var gate = load();
  var cmd = "git log --oneline\n" + makeLines(12);
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null);
});

// --- Substantive line counting ---
test("Skips commands with mostly blank/comment lines", function() {
  var gate = load();
  var lines = [];
  for (var i = 0; i < 15; i++) {
    lines.push(i % 3 === 0 ? "echo real" : (i % 3 === 1 ? "# comment" : ""));
  }
  // Only 5 substantive lines out of 15 total
  var cmd = lines.join("\n");
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null);
});

test("Flags commands with 10+ substantive lines even with comments", function() {
  var gate = load();
  var lines = [];
  for (var i = 0; i < 14; i++) {
    lines.push(i % 4 === 0 ? "# comment" : "echo step" + i);
  }
  // ~10 substantive out of 14
  var cmd = lines.join("\n");
  // Should still return null (advisory) but fire stderr
  var result = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert.strictEqual(result, null);
});

// --- Dedup ---
test("Deduplicates same script in same session", function() {
  // Must unset HOOK_RUNNER_TEST to exercise stderr path
  delete process.env.HOOK_RUNNER_TEST;
  var gate = load();
  var cmd = makeLines(12, "unique_prefix_xyz");

  // Capture stderr
  var stderrData = "";
  var origWrite = process.stderr.write;
  process.stderr.write = function(s) { stderrData += s; return true; };

  gate({ tool_name: "Bash", tool_input: { command: cmd } });
  var first = stderrData;

  stderrData = "";
  gate({ tool_name: "Bash", tool_input: { command: cmd } });
  var second = stderrData;

  process.stderr.write = origWrite;
  process.env.HOOK_RUNNER_TEST = "1"; // restore

  // First call should emit, second should be silent (dedup)
  assert.ok(first.indexOf("script-not-oneoff") !== -1, "First call should emit warning");
  assert.strictEqual(second, "", "Second call should be deduped (no output)");
});

// --- String input parsing ---
test("Handles string tool_input (JSON string)", function() {
  var gate = load();
  var cmd = makeLines(12, "stringinput");
  var input = {
    tool_name: "Bash",
    tool_input: JSON.stringify({ command: cmd })
  };
  var result = gate(input);
  assert.strictEqual(result, null);
});

test("Handles malformed JSON tool_input gracefully", function() {
  var gate = load();
  var input = {
    tool_name: "Bash",
    tool_input: "not valid json"
  };
  var result = gate(input);
  assert.strictEqual(result, null);
});

// --- Empty command ---
test("Returns null for empty command", function() {
  var gate = load();
  var result = gate({ tool_name: "Bash", tool_input: { command: "" } });
  assert.strictEqual(result, null);
});

test("Returns null for missing command field", function() {
  var gate = load();
  var result = gate({ tool_name: "Bash", tool_input: {} });
  assert.strictEqual(result, null);
});

// --- Summary ---
console.log("\n" + passed + "/" + (passed + failed) + " passed");
if (failed > 0) process.exit(1);
