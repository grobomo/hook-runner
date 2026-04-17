#!/usr/bin/env node
"use strict";
// Tests for publish-json-guard.js — T468 allow creation of NEW publish.json
var path = require("path");
var fs = require("fs");
var os = require("os");

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// Fresh-require the module each test (no state leakage)
function loadGuard() {
  var modPath = path.resolve(__dirname, "../../modules/PreToolUse/publish-json-guard.js");
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

// Create a temp dir with optional .github/publish.json
function makeTempDir(withPublishJson) {
  var dir = path.join(os.tmpdir(), "pub-guard-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  fs.mkdirSync(path.join(dir, ".github"), { recursive: true });
  if (withPublishJson) {
    fs.writeFileSync(path.join(dir, ".github", "publish.json"), '{"github_account":"grobomo"}');
  }
  return dir;
}

// --- Edit tool tests ---

test("Edit publish.json: always blocked", function() {
  var guard = loadGuard();
  var dir = makeTempDir(true);
  var r = guard({ tool_name: "Edit", tool_input: { file_path: path.join(dir, ".github/publish.json"), old_string: "grobomo", new_string: "tmemu" } });
  assert(r !== null, "should block");
  assert(r.decision === "block", "decision should be block");
  assert(r.reason.indexOf("publish-json-guard") !== -1, "should mention guard name");
});

test("Edit publish.json: blocked even when file doesn't exist", function() {
  var guard = loadGuard();
  var dir = makeTempDir(false);
  var r = guard({ tool_name: "Edit", tool_input: { file_path: path.join(dir, ".github/publish.json"), old_string: "a", new_string: "b" } });
  assert(r !== null, "should block Edit regardless");
  assert(r.decision === "block", "decision should be block");
});

// --- Write tool tests ---

test("Write publish.json: allowed when file doesn't exist (creation)", function() {
  var guard = loadGuard();
  var dir = makeTempDir(false);
  var r = guard({ tool_name: "Write", tool_input: { file_path: path.join(dir, ".github/publish.json"), content: '{"github_account":"grobomo"}' } });
  assert(r === null, "should allow creation of new publish.json, got: " + JSON.stringify(r));
});

test("Write publish.json: blocked when file already exists (overwrite)", function() {
  var guard = loadGuard();
  var dir = makeTempDir(true);
  var r = guard({ tool_name: "Write", tool_input: { file_path: path.join(dir, ".github/publish.json"), content: '{"github_account":"tmemu"}' } });
  assert(r !== null, "should block overwrite");
  assert(r.decision === "block", "decision should be block");
});

test("Write publish.json: backslash paths normalized", function() {
  var guard = loadGuard();
  var dir = makeTempDir(false);
  var winPath = dir.replace(/\//g, "\\") + "\\.github\\publish.json";
  var r = guard({ tool_name: "Write", tool_input: { file_path: winPath, content: '{}' } });
  assert(r === null, "should allow creation with backslash paths");
});

// --- Unrelated files pass through ---

test("Edit unrelated file: not blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Edit", tool_input: { file_path: "/some/project/src/main.js", old_string: "a", new_string: "b" } });
  assert(r === null, "should pass through");
});

test("Write unrelated file: not blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Write", tool_input: { file_path: "/some/project/README.md", content: "hi" } });
  assert(r === null, "should pass through");
});

// --- Bash: git remote commands ---

test("Bash git remote set-url: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "git remote set-url origin https://github.com/evil/repo.git" } });
  assert(r !== null && r.decision === "block", "should block git remote set-url");
});

test("Bash git remote add: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "git remote add upstream https://github.com/other/repo.git" } });
  assert(r !== null && r.decision === "block", "should block git remote add");
});

test("Bash git remote remove: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "git remote remove origin" } });
  assert(r !== null && r.decision === "block", "should block git remote remove");
});

test("Bash git remote with cd prefix: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "cd /some/project; git remote set-url origin https://evil.com" } });
  assert(r !== null && r.decision === "block", "should block cd+git remote");
});

test("Bash git remote -v (read-only): not blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "git remote -v" } });
  assert(r === null, "should allow git remote -v");
});

// --- Bash: shell writes to publish.json ---

test("Bash sed on publish.json: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "sed -i 's/grobomo/tmemu/' .github/publish.json" } });
  assert(r !== null && r.decision === "block", "should block sed on publish.json");
});

test("Bash cp to publish.json: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "cp /tmp/evil.json .github/publish.json" } });
  assert(r !== null && r.decision === "block", "should block cp to publish.json");
});

test("Bash redirect to new publish.json: allowed when file doesn't exist", function() {
  var guard = loadGuard();
  var dir = makeTempDir(false);
  var target = path.join(dir, ".github/publish.json").replace(/\\/g, "/");
  var r = guard({ tool_name: "Bash", tool_input: { command: 'echo \'{"github_account":"grobomo"}\' > ' + target } });
  assert(r === null, "should allow redirect to non-existent publish.json, got: " + JSON.stringify(r));
});

test("Bash redirect to existing publish.json: blocked", function() {
  var guard = loadGuard();
  var dir = makeTempDir(true);
  var target = path.join(dir, ".github/publish.json").replace(/\\/g, "/");
  var r = guard({ tool_name: "Bash", tool_input: { command: 'echo \'{"github_account":"tmemu"}\' > ' + target } });
  assert(r !== null && r.decision === "block", "should block redirect to existing publish.json");
});

// --- Bash: git config remote ---

test("Bash git config remote.origin.url: blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "git config remote.origin.url https://evil.com" } });
  assert(r !== null && r.decision === "block", "should block git config remote");
});

test("Bash unrelated command: not blocked", function() {
  var guard = loadGuard();
  var r = guard({ tool_name: "Bash", tool_input: { command: "ls -la" } });
  assert(r === null, "should pass through");
});

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
if (failed > 0) process.exit(1);
