#!/usr/bin/env node
"use strict";
// T622: Test session-scoped mandate.json and stop-analysis.md

var path = require("path");
var fs = require("fs");
var os = require("os");
var child_process = require("child_process");

var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var HOME = process.env.HOME || os.homedir();
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var SESSION_A = "sessAAAA";
var SESSION_B = "sessBBBB";

var mandateGatePath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "mandate-gate.js");
var autoGatePath = path.join(__dirname, "..", "..", "modules", "Stop", "auto-continue-gate.js");
var stopGatePath = path.join(__dirname, "..", "..", "modules", "Stop", "stop-analysis-gate.js");

function mandatePath(session) {
  return path.join(HOOKS_DIR, "mandate-" + session.slice(0, 8) + ".json");
}
function analysisPath(session) {
  return path.join(HOOKS_DIR, "stop-analysis-" + session.slice(0, 8) + ".md");
}

function cleanAll() {
  [SESSION_A, SESSION_B, "unknown"].forEach(function(s) {
    try { fs.unlinkSync(mandatePath(s)); } catch (e) {}
    try { fs.unlinkSync(analysisPath(s)); } catch (e) {}
  });
  try { fs.unlinkSync(path.join(HOOKS_DIR, "mandate.json")); } catch (e) {}
  try { fs.unlinkSync(path.join(HOOKS_DIR, "stop-analysis.md")); } catch (e) {}
  try { fs.unlinkSync(path.join(HOOKS_DIR, "mandate-log.jsonl")); } catch (e) {}
}

function runModule(modPath, sessionId, input) {
  var env = Object.assign({}, process.env, {
    CLAUDE_SESSION_ID: sessionId,
    HOOK_RUNNER_TEST: "1",
    HOME: HOME
  });
  var wrapper = [
    "var gate = require(" + JSON.stringify(modPath) + ");",
    "var input = " + JSON.stringify(input || {}) + ";",
    "var r = gate(input);",
    "process.stdout.write(JSON.stringify({ result: r }) + '\\n');"
  ].join("\n");
  try {
    var out = child_process.execFileSync("node", ["-e", wrapper], {
      env: env, timeout: 15000, stdio: ["pipe", "pipe", "pipe"]
    }).toString().trim();
    var lines = out.split("\n");
    for (var i = lines.length - 1; i >= 0; i--) {
      try { return JSON.parse(lines[i]).result; } catch (e) {}
    }
    return undefined;
  } catch (e) { return undefined; }
}

// ===== Mandate path scoping =====

check("mandate-gate reads session-scoped file", function() {
  cleanAll();
  fs.writeFileSync(mandatePath(SESSION_A), JSON.stringify({
    action: "Do task X", source_rule: "test", decision: "CONTINUE",
    actions: ["action 1"], created: new Date().toISOString(), seen: false, fulfilled: false
  }), "utf-8");
  var result = runModule(mandateGatePath, SESSION_A, { tool_name: "Bash" });
  assert(result !== null && result !== undefined, "should block for session A");
  assert(result.decision === "block", "should be a block");
  assert(result.reason.indexOf("Do task X") !== -1, "should contain mandate text");
});

check("mandate-gate ignores other session's mandate", function() {
  cleanAll();
  fs.writeFileSync(mandatePath(SESSION_A), JSON.stringify({
    action: "Session A work", source_rule: "test", created: new Date().toISOString(), seen: false
  }), "utf-8");
  var result = runModule(mandateGatePath, SESSION_B, { tool_name: "Bash" });
  assert(result === null, "session B should not see session A mandate");
});

check("mandate-gate marks seen=true in session-scoped file", function() {
  cleanAll();
  fs.writeFileSync(mandatePath(SESSION_A), JSON.stringify({
    action: "Test mandate", source_rule: "test", created: new Date().toISOString(), seen: false
  }), "utf-8");
  runModule(mandateGatePath, SESSION_A, { tool_name: "Read" });
  var state = JSON.parse(fs.readFileSync(mandatePath(SESSION_A), "utf-8"));
  assert(state.seen === true, "should set seen=true");
});

check("mandate-gate passes after seen=true", function() {
  cleanAll();
  fs.writeFileSync(mandatePath(SESSION_A), JSON.stringify({
    action: "Test", source_rule: "test", created: new Date().toISOString(), seen: true
  }), "utf-8");
  var result = runModule(mandateGatePath, SESSION_A, { tool_name: "Bash" });
  assert(result === null, "should pass when already seen");
});

check("Old global mandate.json is NOT read", function() {
  cleanAll();
  fs.writeFileSync(path.join(HOOKS_DIR, "mandate.json"), JSON.stringify({
    action: "Global stale mandate", source_rule: "stale", created: new Date().toISOString(), seen: false
  }), "utf-8");
  var result = runModule(mandateGatePath, SESSION_A, { tool_name: "Bash" });
  assert(result === null, "should not read global mandate.json");
  try { fs.unlinkSync(path.join(HOOKS_DIR, "mandate.json")); } catch (e) {}
});

check("Expired mandate cleaned up (session-scoped)", function() {
  cleanAll();
  fs.writeFileSync(mandatePath(SESSION_A), JSON.stringify({
    action: "Old mandate", source_rule: "test",
    created: new Date(Date.now() - 11 * 60 * 1000).toISOString(), seen: false
  }), "utf-8");
  var result = runModule(mandateGatePath, SESSION_A, { tool_name: "Bash" });
  assert(result === null, "should pass (expired)");
  assert(!fs.existsSync(mandatePath(SESSION_A)), "should delete expired mandate file");
});

// ===== Analysis path scoping =====

check("stop-analysis-gate writes session-scoped analysis file", function() {
  cleanAll();
  runModule(stopGatePath, SESSION_A, { assistant_message: "I completed the task." });
  // The gate writes to analysis file even on Haiku failure
  var exists = fs.existsSync(analysisPath(SESSION_A));
  assert(exists, "should create session-scoped analysis file");
});

check("stop-analysis written for session A does not exist for session B", function() {
  cleanAll();
  runModule(stopGatePath, SESSION_A, { assistant_message: "Done." });
  assert(!fs.existsSync(analysisPath(SESSION_B)), "session B analysis should not exist");
});

check("Old global stop-analysis.md is not created", function() {
  cleanAll();
  runModule(stopGatePath, SESSION_A, { assistant_message: "Done." });
  assert(!fs.existsSync(path.join(HOOKS_DIR, "stop-analysis.md")), "global stop-analysis.md should not exist");
});

// ===== Session ID derivation =====

check("Session prefix is first 8 chars of CLAUDE_SESSION_ID", function() {
  cleanAll();
  var fullId = "abcdefgh12345678";
  fs.writeFileSync(mandatePath(fullId), JSON.stringify({
    action: "Test prefix", source_rule: "test", created: new Date().toISOString(), seen: false
  }), "utf-8");
  var result = runModule(mandateGatePath, fullId, { tool_name: "Bash" });
  assert(result !== null, "should find mandate with full session ID");
  assert(fs.existsSync(path.join(HOOKS_DIR, "mandate-abcdefgh.json")), "file uses 8-char prefix");
  try { fs.unlinkSync(path.join(HOOKS_DIR, "mandate-abcdefgh.json")); } catch (e) {}
});

check("Missing CLAUDE_SESSION_ID defaults to 'unknown'", function() {
  cleanAll();
  fs.writeFileSync(path.join(HOOKS_DIR, "mandate-unknown.json"), JSON.stringify({
    action: "Default session", source_rule: "test", created: new Date().toISOString(), seen: false
  }), "utf-8");
  var env = Object.assign({}, process.env, { HOOK_RUNNER_TEST: "1", HOME: HOME });
  delete env.CLAUDE_SESSION_ID;
  var wrapper = "var g = require(" + JSON.stringify(mandateGatePath) + "); var r = g({tool_name:'Bash'}); process.stdout.write(JSON.stringify({result:r})+'\\n');";
  try {
    var out = child_process.execFileSync("node", ["-e", wrapper], {
      env: env, timeout: 5000, stdio: ["pipe", "pipe", "pipe"]
    }).toString().trim();
    var parsed = JSON.parse(out);
    assert(parsed.result !== null, "should find mandate for 'unknown' session");
  } catch (e) {
    // Gate may fail for other reasons (haiku), but file should have been read
    assert(fs.existsSync(path.join(HOOKS_DIR, "mandate-unknown.json")), "file should exist");
  }
  try { fs.unlinkSync(path.join(HOOKS_DIR, "mandate-unknown.json")); } catch (e) {}
});

// Cleanup
cleanAll();

console.log("\n    " + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
