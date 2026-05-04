#!/usr/bin/env node
"use strict";
// Tests for _bash-write-patterns.js — shared regex array for detecting state-changing Bash commands.
var path = require("path");
var patterns = require(path.join(__dirname, "..", "..", "modules", "PreToolUse", "_bash-write-patterns.js"));

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
assert(matches("sed -i 's/foo/bar/' file.txt"), "sed -i matches");
assert(matches("awk -i inplace '{print}' file.txt"), "awk -i matches");
assert(matches("tee output.log"), "tee matches");
assert(matches("cp src.txt dst.txt"), "cp matches");
assert(matches("mv old.txt new.txt"), "mv matches");
assert(matches("rm file.txt"), "rm matches");
assert(matches("touch newfile.txt"), "touch matches");
assert(matches("mkdir -p /tmp/dir"), "mkdir matches");
assert(matches("rmdir /tmp/dir"), "rmdir matches");
assert(matches("chmod 755 script.sh"), "chmod matches");
assert(matches("chown user:group file"), "chown matches");
assert(matches("ln -s target link"), "ln matches");
assert(matches("patch < fix.diff"), "patch matches");
assert(matches("truncate -s 0 file.log"), "truncate matches");
assert(matches("install -m 755 bin /usr/local/bin"), "install matches");

// === Output redirection ===
assert(matches('echo "hello" > file.txt'), "echo > matches");
assert(matches('printf "%s" > file.txt'), "printf > matches");
assert(matches("cat input.txt > output.txt"), "cat > matches");

// === Package managers ===
assert(matches("npm install express"), "npm install matches");
assert(matches("npm ci"), "npm ci matches");
assert(matches("npm link"), "npm link matches");
assert(matches("npm uninstall pkg"), "npm uninstall matches");
assert(matches("npm publish"), "npm publish matches");
assert(matches("yarn add react"), "yarn add matches");
assert(matches("yarn install"), "yarn install matches");
assert(matches("yarn remove lodash"), "yarn remove matches");
assert(matches("pnpm add vite"), "pnpm add matches");
assert(matches("pnpm install"), "pnpm install matches");
assert(matches("pnpm remove pkg"), "pnpm remove matches");
assert(matches("pip install requests"), "pip install matches");
assert(matches("pip3 install flask"), "pip3 install matches");
assert(matches("cargo install ripgrep"), "cargo install matches");
assert(matches("cargo build"), "cargo build matches");
assert(matches("conda install numpy"), "conda install matches");
assert(matches("conda create -n env"), "conda create matches");
assert(matches("make"), "make matches");

// === Read-only commands should NOT match ===
assert(!matches("ls -la"), "ls does not match");
assert(!matches("cat file.txt"), "cat (no redirect) does not match");
assert(!matches("grep pattern file"), "grep does not match");
assert(!matches("git status"), "git status does not match");
assert(!matches("git log --oneline"), "git log does not match");
assert(!matches("npm list"), "npm list does not match");
assert(!matches("npm test"), "npm test does not match");
assert(!matches("node script.js"), "node does not match");
assert(!matches("python script.py"), "python (no file write) does not match");
assert(!matches('powershell "[System.IO.Compression.ZipFile]::OpenRead()"'), "powershell OpenRead does not match");
assert(!matches("wsl -e bash -c 'python3 openclaw-checkin.py'"), "wsl python does not match");
assert(!matches("echo hello"), "echo without redirect does not match");

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
