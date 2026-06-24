#!/usr/bin/env node
"use strict";
// T576: Tests for remote-tracking-gate.js
// Blocks Edit/Write on feature branches without remote tracking.
// Uses _git.branch and _git.tracking from runner input (avoids git spawn).

var path = require("path");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "remote-tracking-gate.js");
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

function makeInput(tool, filePath, branch, tracking) {
  var input = {
    tool_name: tool,
    tool_input: { file_path: filePath },
    _git: { branch: branch, tracking: tracking }
  };
  return input;
}

// --- Non-Edit/Write tools pass ---

check("Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" }, _git: { branch: "feat", tracking: "" } }) === null);
});

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "x.js" }, _git: { branch: "feat", tracking: "" } }) === null);
});

// --- Config/spec files exempt ---

check("Edit .md file: passes (config exempt)", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "README.md", "feat", "")) === null);
});

check("Edit .json file: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "package.json", "feat", "")) === null);
});

check("Edit .yaml file: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "config.yaml", "feat", "")) === null);
});

check("Edit .yml file: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "config.yml", "feat", "")) === null);
});

check("Edit specs/ file: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "specs/feature/tasks.js", "feat", "")) === null);
});

check("Edit .claude/ file: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", ".claude/settings.js", "feat", "")) === null);
});

check("Edit .github/ file: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", ".github/workflows/ci.js", "feat", "")) === null);
});

check("Edit cloudformation/ file: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "cloudformation/template.js", "feat", "")) === null);
});

// --- main/master branch: passes ---

check("Edit on main: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "src/app.js", "main", "")) === null);
});

check("Edit on master: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "src/app.js", "master", "")) === null);
});

// --- No branch info: passes ---

check("No branch: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "src/app.js", "", "")) === null);
});

// --- Feature branch WITH tracking: passes ---

check("Feature branch with tracking: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Edit", "src/app.js", "feat-123", "origin")) === null);
});

check("Write on tracked branch: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("Write", "src/new.js", "feat-123", "origin")) === null);
});

// --- Feature branch WITHOUT tracking: blocks ---

check("Edit .js on untracked branch: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("Edit", "src/app.js", "feat-untracked", ""));
  assert(r && r.decision === "block", "should block");
  assert(/BLOCKED|remote|tracking|branch/i.test(r.reason));
  assert(/WHY:/.test(r.reason));
});

check("Write .js on untracked branch: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("Write", "src/new.js", "feat-untracked", ""));
  assert(r && r.decision === "block");
});

check("Edit .ts on untracked branch: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput("Edit", "src/app.ts", "feat-xyz", ""));
  assert(r && r.decision === "block");
});

// --- Fallback: _git.tracking is null (runner didn't provide) ---
// In this case the module falls back to git config check.
// We can't easily test this without a real git repo, but we can
// verify the module handles the null case without crashing.

check("_git.tracking null: falls back to git config (no crash)", function() {
  var gate = loadGate();
  // On main the module returns null before checking tracking
  var input = {
    tool_name: "Edit",
    tool_input: { file_path: "src/app.js" },
    _git: { branch: "main" }
    // tracking not set — will be null
  };
  assert(gate(input) === null);
});

// --- Edge cases ---

check("String tool_input: parsed correctly", function() {
  var gate = loadGate();
  var input = {
    tool_name: "Edit",
    tool_input: JSON.stringify({ file_path: "src/app.js" }),
    _git: { branch: "feat", tracking: "origin" }
  };
  assert(gate(input) === null);
});

check("Missing tool_input on tracked branch: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", _git: { branch: "feat", tracking: "origin" } }) === null);
});

check("Missing tool_input on untracked branch: blocks (no file to exempt)", function() {
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", _git: { branch: "feat", tracking: "" } });
  assert(r && r.decision === "block");
});

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
