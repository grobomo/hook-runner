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

// === T608: Compound commands — redirect patterns must not cross statement boundaries ===
assert(!matches('echo "=== test ==="; for mod in *.js; do ls "$mod"; done'), "echo before semicolon+for loop does not match");
assert(!matches('echo "hello"; cat file.txt 2>/dev/null'), "echo; cat with 2>/dev/null does not match");
assert(!matches('cat file.txt 2>/dev/null'), "cat with 2>/dev/null (stderr redirect) does not match");
assert(!matches('echo "text" 2>/dev/null'), "echo with 2>/dev/null (stderr redirect) does not match");
assert(!matches('printf "text" 2>/dev/null'), "printf with 2>/dev/null (stderr redirect) does not match");
assert(!matches('echo "status" && git status'), "echo && git status does not match");
assert(!matches('for evt in a b c; do echo "=== $evt ==="; done'), "for loop with echo (no redirect) does not match");
assert(!matches('echo "text"; printf "more"; cat file'), "multiple echo/printf/cat without redirect does not match");
assert(!matches('echo "info"; ls scripts/test/test-*"$base"* 2>/dev/null | head -1'), "echo; ls with 2>/dev/null pipe does not match");
// Redirects within the same statement should still match
assert(matches('echo "hello" > file.txt; cat other.txt'), "echo > file before semicolon still matches");
assert(matches('printf "data" > out.log && echo done'), "printf > file before && still matches");
assert(matches('cat in.txt > out.txt; rm tmp'), "cat > file before semicolon still matches");

// === T732: parseBashWrite() tests ===
var parseBashWrite = patterns.parseBashWrite;
var extractTargetPath = patterns.extractTargetPath;
var extractContent = patterns.extractContent;

assert(typeof parseBashWrite === "function", "parseBashWrite is a function");
assert(typeof extractTargetPath === "function", "extractTargetPath is a function");
assert(typeof extractContent === "function", "extractContent is a function");

// parseBashWrite returns null for non-write commands
assert(parseBashWrite("ls -la") === null, "parseBashWrite: ls returns null");
assert(parseBashWrite("cat file.txt") === null, "parseBashWrite: cat without redirect returns null");
assert(parseBashWrite("git status") === null, "parseBashWrite: git status returns null");
assert(parseBashWrite("") === null, "parseBashWrite: empty string returns null");
assert(parseBashWrite(null) === null, "parseBashWrite: null returns null");

// parseBashWrite extracts target path from redirect commands
var r = parseBashWrite('echo "hello" > /tmp/out.txt');
assert(r !== null && r.targetPath === "/tmp/out.txt", "parseBashWrite: echo > extracts path");

r = parseBashWrite('printf "data" > /tmp/result.log');
assert(r !== null && r.targetPath === "/tmp/result.log", "parseBashWrite: printf > extracts path");

r = parseBashWrite("tee /tmp/output.log");
assert(r !== null && r.targetPath === "/tmp/output.log", "parseBashWrite: tee extracts path");

r = parseBashWrite('tee -a "/tmp/append.log"');
assert(r !== null && r.targetPath === "/tmp/append.log", "parseBashWrite: tee -a with quotes extracts path");

// parseBashWrite extracts content from echo/printf
r = parseBashWrite('echo "hello world" > /tmp/out.txt');
assert(r !== null && r.content === "hello world", "parseBashWrite: echo extracts content");

r = parseBashWrite('printf "formatted output" > /tmp/out.txt');
assert(r !== null && r.content === "formatted output", "parseBashWrite: printf extracts content");

// parseBashWrite extracts content from heredocs
var heredocCmd = 'cat > /tmp/out.js <<\'EOF\'\nvar x = "hello";\nconsole.log(x);\nEOF';
r = parseBashWrite(heredocCmd);
assert(r !== null && r.targetPath === "/tmp/out.js", "parseBashWrite: heredoc extracts path");
assert(r !== null && r.content !== null && r.content.indexOf('var x') >= 0, "parseBashWrite: heredoc extracts content");

// parseBashWrite with sed -i (no content, just path)
r = parseBashWrite("sed -i 's/foo/bar/' /tmp/file.txt");
assert(r !== null && r.targetPath === "/tmp/file.txt", "parseBashWrite: sed -i extracts path");
assert(r !== null && r.content === null, "parseBashWrite: sed -i has null content");

// extractTargetPath edge cases
assert(extractTargetPath('echo x >> "/tmp/append.log"') === "/tmp/append.log", "extractTargetPath: >> with quotes");
assert(extractTargetPath("echo x >> /tmp/append.log") === "/tmp/append.log", "extractTargetPath: >> without quotes");
assert(extractTargetPath('echo x > "/tmp/file.txt"') === "/tmp/file.txt", "extractTargetPath: > with double quotes");
assert(extractTargetPath("echo x > '/tmp/file.txt'") === "/tmp/file.txt", "extractTargetPath: > with single quotes");

// extractContent edge cases
assert(extractContent("echo hello > /tmp/f") === "hello", "extractContent: unquoted echo");
assert(extractContent("git status") === null, "extractContent: non-write returns null");

console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
