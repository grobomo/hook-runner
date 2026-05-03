#!/usr/bin/env node
"use strict";
// T575: Tests for deploy-gate.js
// Blocks deploy commands when there are uncommitted git changes.

var path = require("path");
var fs = require("fs");
var os = require("os");
var cp = require("child_process");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "deploy-gate.js");
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

// Create a temp git repo for testing
var tmpDir = path.join(os.tmpdir(), "test-deploy-gate-" + Date.now());
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

// --- Non-deploy commands pass ---

check("git status: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("git status")) === null);
});

check("npm install: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("npm install")) === null);
});

// --- Deploy patterns on clean tree: passes ---

check("upload-and-run on clean tree: passes", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("bash scripts/upload-and-run.sh")) === null);
});

check("kubectl apply on clean tree: passes", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("kubectl apply -f deploy.yaml")) === null);
});

check("terraform apply on clean tree: passes", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("terraform apply")) === null);
});

check("docker push on clean tree: passes", function() {
  process.chdir(tmpDir);
  var gate = loadGate();
  assert(gate(makeInput("docker push myimage:latest")) === null);
});

// --- Deploy patterns on dirty tree: blocks ---

check("upload-and-run on dirty tree: blocks", function() {
  process.chdir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, "dirty.txt"), "uncommitted");
  var gate = loadGate();
  var r = gate(makeInput("bash scripts/upload-and-run.sh"));
  assert(r && r.decision === "block", "should block with uncommitted changes");
  assert(r.reason.indexOf("DEPLOY GATE") >= 0);
  assert(r.reason.indexOf("uncommitted") >= 0);
  // Clean up
  fs.unlinkSync(path.join(tmpDir, "dirty.txt"));
});

check("quick-sync on dirty tree: blocks", function() {
  process.chdir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, "dirty2.txt"), "uncommitted");
  var gate = loadGate();
  var r = gate(makeInput("bash scripts/quick-sync.sh"));
  assert(r && r.decision === "block");
  fs.unlinkSync(path.join(tmpDir, "dirty2.txt"));
});

check("create-zip on dirty tree: blocks", function() {
  process.chdir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, "dirty3.txt"), "uncommitted");
  var gate = loadGate();
  var r = gate(makeInput("bash scripts/e2e/create-zip.sh"));
  assert(r && r.decision === "block");
  fs.unlinkSync(path.join(tmpDir, "dirty3.txt"));
});

check("scp with remote: blocks on dirty tree", function() {
  process.chdir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, "dirty4.txt"), "uncommitted");
  var gate = loadGate();
  var r = gate(makeInput("scp file.txt user@host:/tmp/"));
  assert(r && r.decision === "block");
  fs.unlinkSync(path.join(tmpDir, "dirty4.txt"));
});

check("aws s3 cp: blocks on dirty tree", function() {
  process.chdir(tmpDir);
  fs.writeFileSync(path.join(tmpDir, "dirty5.txt"), "uncommitted");
  var gate = loadGate();
  var r = gate(makeInput("aws s3 cp file.zip s3://bucket/"));
  assert(r && r.decision === "block");
  fs.unlinkSync(path.join(tmpDir, "dirty5.txt"));
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
