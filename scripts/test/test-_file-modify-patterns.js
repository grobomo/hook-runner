#!/usr/bin/env node
"use strict";
// Tests for _file-modify-patterns.js — shared regex array for detecting file modification in Bash.
var path = require("path");
var patterns = require(path.join(__dirname, "..", "..", "modules", "PreToolUse", "_file-modify-patterns.js"));

var passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log("OK: " + msg); }
  else { failed++; console.error("FAIL: " + msg); }
}

function matches(cmd) {
  return patterns.some(function(rx) { return rx.test(cmd); });
}

// === Contract ===
assert(Array.isArray(patterns), "Exports an array");
assert(patterns.length > 0, "Array is non-empty");
assert(patterns.every(function(p) { return p instanceof RegExp; }), "All elements are RegExp");

// === File modification commands should match ===
assert(matches("sed -i 's/old/new/' file.txt"), "sed -i matches");
assert(matches("awk -i inplace '{print}' f.txt"), "awk -i matches");
assert(matches('echo "data" > out.txt'), "echo > matches");
assert(matches("cat src.txt > dst.txt"), "cat file > file matches");
assert(matches("tee /tmp/log"), "tee matches");
assert(matches('printf "x" > file'), "printf > matches");
assert(matches("cp source dest"), "cp matches");
assert(matches("mv old new"), "mv matches");

// === Python file write pattern ===
assert(matches("python open('file', 'w')"), "python open w matches");
assert(matches("python3 open('f.txt', 'w')"), "python3 open w matches");
assert(matches('python2 open("f", "w")'), "python2 open w matches");

// === Read-only commands should NOT match ===
assert(!matches("ls -la"), "ls does not match");
assert(!matches("cat file.txt"), "cat (no redirect) does not match");
assert(!matches("grep pattern file"), "grep does not match");
assert(!matches("git diff"), "git diff does not match");
assert(!matches("node script.js"), "node does not match");
assert(!matches("python script.py"), "python (no open w) does not match");
assert(!matches("sed 's/old/new/' file.txt"), "sed without -i does not match");
assert(!matches("awk '{print}' file.txt"), "awk without -i does not match");
assert(!matches("echo hello"), "echo without redirect does not match");

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
