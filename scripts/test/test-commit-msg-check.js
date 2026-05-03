#!/usr/bin/env node
"use strict";
// T581: Tests for commit-msg-check.js (PostToolUse)
// Warns/blocks if git commit messages don't follow conventions.

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "commit-msg-check.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

// --- Non-applicable inputs ---

check("Non-Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "x" } }) === null);
});

check("Bash non-git command: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls -la" } }) === null);
});

check("Bash git status (not commit): passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "git status" } }) === null);
});

check("Bash git commit --amend: skipped", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: 'git commit --amend -m "wip stuff"' } }) === null);
});

check("No message extractable: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "git commit" } }) === null);
});

// --- Good commit messages ---

check("Task ID prefix: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "T581: Add tests for commit-msg-check"' } }) === null);
});

check("Conventional feat: prefix: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "feat: add new feature"' } }) === null);
});

check("Conventional fix(scope): prefix: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "fix(auth): resolve login issue"' } }) === null);
});

check("Conventional chore!: prefix: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "chore!: drop Node 14 support"' } }) === null);
});

// --- WIP/fixup messages ---

check("WIP prefix: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "wip saving progress"' } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("wip") !== -1);
});

check("fixup! prefix: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "fixup! previous commit"' } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("fixup!") !== -1);
});

check("squash! prefix: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "squash! merge these"' } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("tmp prefix: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "tmp checkpoint"' } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("temp prefix: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "temp save state"' } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("WIP case-insensitive: blocks", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "WIP fixing tests"' } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

// --- Long first line ---

check("72 chars exactly: passes", function() {
  var gate = loadGate();
  var msg = "T581: " + "x".repeat(66); // 6 + 66 = 72
  assert(gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "' + msg + '"' } }) === null);
});

check("73+ chars first line: blocks", function() {
  var gate = loadGate();
  var msg = "T581: " + "x".repeat(67); // 6 + 67 = 73
  var r = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "' + msg + '"' } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("73 chars") !== -1);
});

// --- HEREDOC pattern ---

check("HEREDOC commit message: good message passes", function() {
  var gate = loadGate();
  var cmd = "git commit -m \"$(cat <<'EOF'\nT581: Add tests for module\nEOF\n)\"";
  assert(gate({ tool_name: "Bash", tool_input: { command: cmd } }) === null);
});

check("HEREDOC commit message: WIP blocks", function() {
  var gate = loadGate();
  var cmd = "git commit -m \"$(cat <<'EOF'\nwip stuff\nEOF\n)\"";
  var r = gate({ tool_name: "Bash", tool_input: { command: cmd } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

// --- Multiple warnings ---

check("WIP + long line: multiple warnings", function() {
  var gate = loadGate();
  var msg = "wip " + "x".repeat(70); // wip + 70 = 74 chars
  var r = gate({ tool_name: "Bash", tool_input: { command: 'git commit -m "' + msg + '"' } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("wip") !== -1);
  assert(r.reason.indexOf("chars") !== -1);
});

// --- Edge cases ---

check("Single-quoted message: passes good msg", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "git commit -m 'T100: Quick fix'" } }) === null);
});

check("Empty tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: {} }) === null);
});

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash" }) === null);
});

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
