#!/usr/bin/env node
"use strict";
// T575: Tests for deploy-history-reminder.js
// Non-blocking: writes advisory to stderr when deploy command matches.
// Reminds to check recent git history before deploying.

var path = require("path");
var fs = require("fs");
var os = require("os");
var cp = require("child_process");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "deploy-history-reminder.js");
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

function makeInput(cmd) {
  return { tool_name: "Bash", tool_input: { command: cmd } };
}

// Create a temp git repo
var tmpDir = path.join(os.tmpdir(), "test-deploy-history-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });
cp.execFileSync("git", ["init"], { cwd: tmpDir, windowsHide: true });
cp.execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: tmpDir, windowsHide: true });
cp.execFileSync("git", ["config", "user.name", "Test"], { cwd: tmpDir, windowsHide: true });
fs.writeFileSync(path.join(tmpDir, "file.txt"), "initial");
cp.execFileSync("git", ["add", "."], { cwd: tmpDir, windowsHide: true });
cp.execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir, windowsHide: true });

var origCwd = process.cwd();

function cleanup() {
  process.chdir(origCwd);
  try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
}

// --- Non-Bash tools pass ---

check("Non-Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "x" } }) === null);
});

// --- Non-deploy commands: passes (no stderr) ---

check("git status: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("git status")) === null);
});

check("npm install: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("npm install")) === null);
});

// --- Deploy patterns: always returns null (non-blocking) ---

check("upload-and-run: returns null (advisory only)", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("bash scripts/upload-and-run.sh")) === null);
});

check("quick-sync: returns null", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("bash scripts/quick-sync.sh")) === null);
});

check("create-zip: returns null", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("bash scripts/e2e/create-zip.sh")) === null);
});

check("terraform apply: returns null", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("terraform apply")) === null);
});

check("kubectl apply: returns null", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("kubectl apply -f deploy.yaml")) === null);
});

check("docker push: returns null", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("docker push myimage:latest")) === null);
});

check("aws s3 cp: returns null", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("aws s3 cp file.zip s3://bucket/")) === null);
});

check("scp with remote: returns null", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("scp file.txt user@host:/tmp/")) === null);
});

check("rsync with remote: returns null", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("rsync -avz ./dist/ user@host:/opt/app/")) === null);
});

// --- Edge cases ---

check("Empty command: passes", function() {
  process.chdir(origCwd);
  var gate = loadGate();
  assert(gate(makeInput("")) === null);
});

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash" }) === null);
});

cleanup();

// --- Summary ---
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
