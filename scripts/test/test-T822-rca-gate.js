#!/usr/bin/env node
"use strict";
// T822: RCA write reminder (PostToolUse) + read check (SessionStart)
var path = require("path");
var os = require("os");
var fs = require("fs");

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS: " + name); passed++; }
  catch (e) { console.log("  FAIL: " + name); console.log("    " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var HOME = os.homedir();
var WRITE_MOD = path.join(__dirname, "..", "..", "modules", "PostToolUse", "rca-write-check.js");
var READ_MOD = path.join(__dirname, "..", "..", "modules", "SessionStart", "rca-read-check.js");
var TMP = path.join(os.tmpdir(), "t822-test-" + process.pid);
var FLAG = path.join(HOME, ".claude", "hooks", ".rca-reminded");

// Setup temp dirs
function setup() {
  try { fs.mkdirSync(path.join(TMP, "lessons", "runtime"), { recursive: true }); } catch (e) {}
  try { fs.mkdirSync(path.join(TMP, "docs", "rca"), { recursive: true }); } catch (e) {}
  // Remove debounce flag
  try { fs.unlinkSync(FLAG); } catch (e) {}
}

function cleanup() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  try { fs.unlinkSync(FLAG); } catch (e) {}
}

function freshWriteMod() {
  delete require.cache[require.resolve(WRITE_MOD)];
  // Point healing dir to temp
  var origHome = process.env.HOME;
  // We can't easily change HOME for the module, so we'll test the module contract
  return require(WRITE_MOD);
}

function freshReadMod() {
  delete require.cache[require.resolve(READ_MOD)];
  return require(READ_MOD);
}

setup();

console.log("=== T822: RCA Enforcement Gate ===\n");

// --- PostToolUse: rca-write-check ---
console.log("--- PostToolUse: rca-write-check module contract ---");

test("module exports a function", function() {
  var mod = freshWriteMod();
  assert(typeof mod === "function", "not a function");
});

test("returns null for non-Bash/Edit/Write tools", function() {
  var mod = freshWriteMod();
  var r = mod({ tool_name: "Read" });
  assert(r === null, "should return null for Read");
});

test("returns null for Bash (no recent lessons)", function() {
  var mod = freshWriteMod();
  var r = mod({ tool_name: "Bash", tool_input: { command: "ls" } });
  assert(r === null, "should return null when no lessons exist");
});

test("returns null for Edit", function() {
  var mod = freshWriteMod();
  var r = mod({ tool_name: "Edit", tool_input: {} });
  assert(r === null, "should return null for Edit");
});

test("returns null for Write", function() {
  var mod = freshWriteMod();
  var r = mod({ tool_name: "Write", tool_input: {} });
  assert(r === null, "should return null for Write");
});

test("never blocks (always returns null)", function() {
  var mod = freshWriteMod();
  // Even with bad input, should never block
  var r = mod({ tool_name: "Bash", tool_input: null });
  assert(r === null, "should never block");
});

test("handles missing tool_name gracefully", function() {
  var mod = freshWriteMod();
  var r = mod({});
  assert(r === null, "should return null for missing tool_name");
});

test("handles null input gracefully", function() {
  var mod = freshWriteMod();
  var r = mod(null);
  assert(r === null, "should return null for null input");
});

// --- Source code checks ---
console.log("\n--- PostToolUse: rca-write-check source validation ---");

test("has WORKFLOW tag", function() {
  var src = fs.readFileSync(WRITE_MOD, "utf-8");
  assert(/\/\/ WORKFLOW:/.test(src), "missing WORKFLOW tag");
});

test("has WHY comment", function() {
  var src = fs.readFileSync(WRITE_MOD, "utf-8");
  assert(/\/\/ WHY:/.test(src), "missing WHY comment");
});

test("has INCIDENT HISTORY", function() {
  var src = fs.readFileSync(WRITE_MOD, "utf-8");
  assert(/INCIDENT HISTORY/.test(src), "missing INCIDENT HISTORY");
});

test("logs to hook-log.jsonl", function() {
  var src = fs.readFileSync(WRITE_MOD, "utf-8");
  assert(/hook-log\.jsonl/.test(src), "missing hook-log.jsonl logging");
});

test("has debounce mechanism", function() {
  var src = fs.readFileSync(WRITE_MOD, "utf-8");
  assert(/debounce|FLAG|\.rca-reminded/i.test(src), "missing debounce");
});

test("uses stderr (non-blocking)", function() {
  var src = fs.readFileSync(WRITE_MOD, "utf-8");
  assert(/process\.stderr\.write/.test(src), "should use stderr");
  assert(!/decision.*block/i.test(src), "should never block");
});

test("checks self-healing lessons dir", function() {
  var src = fs.readFileSync(WRITE_MOD, "utf-8");
  assert(/self-healing.*lessons|HEALING_DIR/.test(src), "should reference self-healing lessons");
});

test("checks docs/rca/ for existing RCAs", function() {
  var src = fs.readFileSync(WRITE_MOD, "utf-8");
  assert(/docs.*rca|rcaDir/.test(src), "should check docs/rca/");
});

// --- SessionStart: rca-read-check ---
console.log("\n--- SessionStart: rca-read-check module contract ---");

test("module exports a function", function() {
  var mod = freshReadMod();
  assert(typeof mod === "function", "not a function");
});

test("returns null when no docs/rca/ exists", function() {
  process.env.CLAUDE_PROJECT_DIR = path.join(TMP, "noproject");
  var mod = freshReadMod();
  var r = mod();
  assert(r === null, "should return null when no rca dir");
});

test("returns null when docs/rca/ is empty", function() {
  var projDir = path.join(TMP, "emptyproject");
  fs.mkdirSync(path.join(projDir, "docs", "rca"), { recursive: true });
  process.env.CLAUDE_PROJECT_DIR = projDir;
  var mod = freshReadMod();
  var r = mod();
  assert(r === null, "should return null when rca dir is empty");
});

test("emits stderr when recent RCAs exist", function() {
  var projDir = path.join(TMP, "rcaproject");
  var rcaDir = path.join(projDir, "docs", "rca");
  fs.mkdirSync(rcaDir, { recursive: true });
  var today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(rcaDir, today + "-tab-crash.md"),
    "# Incident\nTabs crashed\n# Root Cause\nToo many tabs\n");
  process.env.CLAUDE_PROJECT_DIR = projDir;

  var stderrOutput = "";
  var origWrite = process.stderr.write;
  process.stderr.write = function(s) { stderrOutput += s; };

  var mod = freshReadMod();
  var r = mod();

  process.stderr.write = origWrite;
  assert(r === null, "should return null (non-blocking)");
  assert(stderrOutput.indexOf("RCA") !== -1, "should mention RCA in stderr: " + stderrOutput);
  assert(stderrOutput.indexOf(today) !== -1, "should mention today's date");
});

test("ignores old RCA files (>7 days)", function() {
  var projDir = path.join(TMP, "oldrcaproject");
  var rcaDir = path.join(projDir, "docs", "rca");
  fs.mkdirSync(rcaDir, { recursive: true });
  var oldFile = path.join(rcaDir, "2020-01-01-ancient.md");
  fs.writeFileSync(oldFile, "# Old incident\n");
  // Set mtime to 30 days ago
  var oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldFile, oldTime, oldTime);
  process.env.CLAUDE_PROJECT_DIR = projDir;

  var mod = freshReadMod();
  var r = mod();
  assert(r === null, "should return null for old RCAs");
});

test("never blocks", function() {
  var mod = freshReadMod();
  var r = mod();
  assert(r === null, "should never block");
});

// --- Source code checks ---
console.log("\n--- SessionStart: rca-read-check source validation ---");

test("has WORKFLOW tag", function() {
  var src = fs.readFileSync(READ_MOD, "utf-8");
  assert(/\/\/ WORKFLOW:/.test(src), "missing WORKFLOW tag");
});

test("has WHY comment", function() {
  var src = fs.readFileSync(READ_MOD, "utf-8");
  assert(/\/\/ WHY:/.test(src), "missing WHY comment");
});

test("has INCIDENT HISTORY", function() {
  var src = fs.readFileSync(READ_MOD, "utf-8");
  assert(/INCIDENT HISTORY/.test(src), "missing INCIDENT HISTORY");
});

test("logs to hook-log.jsonl", function() {
  var src = fs.readFileSync(READ_MOD, "utf-8");
  assert(/hook-log\.jsonl/.test(src), "missing hook-log.jsonl logging");
});

test("uses 7-day window", function() {
  var src = fs.readFileSync(READ_MOD, "utf-8");
  assert(/7\s*\*\s*24|7 days/.test(src), "should use 7-day window");
});

cleanup();

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);
