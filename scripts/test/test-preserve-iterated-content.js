#!/usr/bin/env node
/**
 * Test suite for preserve-iterated-content PreToolUse module.
 * Tests that Write (full rewrite) on files with significant git history are blocked.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var pass = 0;
var fail = 0;

function ok(name, result) {
  if (result) {
    pass++;
    console.log("OK: " + name);
  } else {
    fail++;
    console.log("FAIL: " + name);
  }
}

var modulePath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "preserve-iterated-content.js");
var CACHE_FILE = path.join(os.tmpdir(), "hook-runner-iterated-cache.json");

// Save and restore cache
var origCache = null;
try { origCache = fs.readFileSync(CACHE_FILE, "utf-8"); } catch(e) {}

function clearCache() {
  try { fs.unlinkSync(CACHE_FILE); } catch(e) {}
}

function setCache(entries) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(entries));
}

function runGate(input) {
  delete require.cache[require.resolve(modulePath)];
  var gate = require(modulePath);
  return gate(input);
}

function blocks(input) {
  var result = runGate(input);
  return result && result.decision === "block";
}

function passes(input) {
  return runGate(input) === null;
}

// Create temp git repo with a file that has many commits
var tmpDir = path.join(os.tmpdir(), "preserve-iter-test-" + process.pid);
fs.mkdirSync(path.join(tmpDir, "hooks"), { recursive: true });
cp.execFileSync("git", ["init"], { cwd: tmpDir, windowsHide: true });
cp.execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: tmpDir, windowsHide: true });
cp.execFileSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, windowsHide: true });

// Create a file with 6 commits (above threshold of 5)
var iterFile = path.join(tmpDir, "hooks", "iterated.js");
for (var i = 0; i < 6; i++) {
  fs.writeFileSync(iterFile, "// version " + i + "\nmodule.exports = {};\n");
  cp.execFileSync("git", ["add", "."], { cwd: tmpDir, windowsHide: true });
  cp.execFileSync("git", ["commit", "-m", "iter " + i], { cwd: tmpDir, windowsHide: true });
}

// Create a file with 2 commits (below threshold)
var newFile = path.join(tmpDir, "hooks", "new.js");
for (var j = 0; j < 2; j++) {
  fs.writeFileSync(newFile, "// v" + j + "\n");
  cp.execFileSync("git", ["add", "."], { cwd: tmpDir, windowsHide: true });
  cp.execFileSync("git", ["commit", "-m", "new " + j], { cwd: tmpDir, windowsHide: true });
}

// === Non-Write tools should pass ===
clearCache();
ok("Edit tool: passes", passes({
  tool_name: "Edit", tool_input: { file_path: iterFile, old_string: "a", new_string: "b" }
}));

ok("Read tool: passes", passes({
  tool_name: "Read", tool_input: { file_path: iterFile }
}));

ok("Bash tool: passes", passes({
  tool_name: "Bash", tool_input: { command: "echo test" }
}));

// === Write to non-watched directories should pass ===
clearCache();
ok("Write to /tmp: passes", passes({
  tool_name: "Write", tool_input: { file_path: path.join(tmpDir, "src", "app.js"), content: "test" }
}));

// === Write to file without path should pass ===
ok("Write no file_path: passes", passes({
  tool_name: "Write", tool_input: {}
}));

// === Write to new file (doesn't exist) should pass ===
clearCache();
ok("Write to nonexistent file: passes", passes({
  tool_name: "Write", tool_input: { file_path: path.join(tmpDir, "hooks", "nonexistent.js"), content: "new" }
}));

// === Write to iterated file (6 commits) should block ===
clearCache();
ok("Write to iterated file: blocks", blocks({
  tool_name: "Write", tool_input: { file_path: iterFile, content: "rewrite" }
}));

// === Write to new file (2 commits) should pass ===
clearCache();
ok("Write to low-commit file: passes", passes({
  tool_name: "Write", tool_input: { file_path: newFile, content: "rewrite" }
}));

// === Block message quality ===
clearCache();
var blockResult = runGate({
  tool_name: "Write", tool_input: { file_path: iterFile, content: "rewrite" }
});
ok("block mentions commit count", blockResult && /\d+ commits/.test(blockResult.reason));
ok("block mentions Edit", blockResult && blockResult.reason.indexOf("Edit") !== -1);
ok("block mentions file name", blockResult && blockResult.reason.indexOf("iterated.js") !== -1);

// === Cache behavior ===
clearCache();
// First call populates cache
runGate({ tool_name: "Write", tool_input: { file_path: iterFile, content: "x" } });
ok("cache file created", fs.existsSync(CACHE_FILE));

// Read cache
var cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
var norm = iterFile.replace(/\\/g, "/");
ok("cache has entry for file", cache[norm] !== undefined);
ok("cache entry has count", cache[norm] && cache[norm].count === 6);
ok("cache entry has timestamp", cache[norm] && typeof cache[norm].ts === "number");

// Second call uses cache (no git spawn needed)
var start = Date.now();
runGate({ tool_name: "Write", tool_input: { file_path: iterFile, content: "x" } });
var elapsed = Date.now() - start;
ok("cached call is fast (<50ms)", elapsed < 50);

// === Watched directories check ===
clearCache();
// Only /hooks/, /rules/, /skills/, /scripts/ are watched
var unwatchedFile = path.join(tmpDir, "docs", "readme.md");
fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
fs.writeFileSync(unwatchedFile, "test");
ok("Write to unwatched dir: passes", passes({
  tool_name: "Write", tool_input: { file_path: unwatchedFile, content: "rewrite" }
}));

// Test /scripts/ is watched
var scriptFile = path.join(tmpDir, "scripts", "test.sh");
fs.mkdirSync(path.join(tmpDir, "scripts"), { recursive: true });
fs.writeFileSync(scriptFile, "#!/bin/bash");
cp.execFileSync("git", ["add", "."], { cwd: tmpDir, windowsHide: true });
cp.execFileSync("git", ["commit", "-m", "script"], { cwd: tmpDir, windowsHide: true });
clearCache();
// Only 1 commit — should pass regardless
ok("Write to scripts/ with 1 commit: passes", passes({
  tool_name: "Write", tool_input: { file_path: scriptFile, content: "new" }
}));

// === Cleanup ===
if (origCache) {
  fs.writeFileSync(CACHE_FILE, origCache);
} else {
  clearCache();
}
try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
