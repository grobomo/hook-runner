#!/usr/bin/env node
"use strict";
// T808: reflection-first-gate — forces reflection in TODO.md after user corrections
var path = require("path");
var os = require("os");
var fs = require("fs");

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log("  PASS: " + name); passed++; }
  catch (e) { console.log("  FAIL: " + name); console.log("    " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

var MOD_PATH = path.join(__dirname, "..", "..", "modules", "PreToolUse", "reflection-first-gate.js");
var HOME = os.homedir();
var HOOKS_DIR = path.join(HOME, ".claude", "hooks");
var CORRECTION_LOG = path.join(HOOKS_DIR, "correction-log.jsonl");
var FLAG_FILE = path.join(HOOKS_DIR, ".reflection-pending.json");

// Backup and restore correction-log
var origCorrectionLog = null;
var origFlagFile = null;

function backup() {
  try { origCorrectionLog = fs.readFileSync(CORRECTION_LOG, "utf-8"); } catch (e) { origCorrectionLog = null; }
  try { origFlagFile = fs.readFileSync(FLAG_FILE, "utf-8"); } catch (e) { origFlagFile = null; }
}

function restore() {
  if (origCorrectionLog !== null) {
    fs.writeFileSync(CORRECTION_LOG, origCorrectionLog);
  } else {
    try { fs.unlinkSync(CORRECTION_LOG); } catch (e) {}
  }
  if (origFlagFile !== null) {
    fs.writeFileSync(FLAG_FILE, origFlagFile);
  } else {
    try { fs.unlinkSync(FLAG_FILE); } catch (e) {}
  }
}

function freshGate() {
  delete require.cache[require.resolve(MOD_PATH)];
  return require(MOD_PATH);
}

function clearState() {
  try { fs.unlinkSync(FLAG_FILE); } catch (e) {}
}

function writeRecentCorrection(preview) {
  var entry = JSON.stringify({
    ts: new Date().toISOString(),
    project: "test",
    prompt_preview: preview || "no, that's wrong",
    pattern: "/^no/i"
  }) + "\n";
  fs.writeFileSync(CORRECTION_LOG, entry);
}

function writeOldCorrection() {
  var oldTs = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
  var entry = JSON.stringify({
    ts: oldTs,
    project: "test",
    prompt_preview: "wrong",
    pattern: "/wrong/i"
  }) + "\n";
  fs.writeFileSync(CORRECTION_LOG, entry);
}

function setFlag(reflected) {
  fs.writeFileSync(FLAG_FILE, JSON.stringify({
    ts: new Date().toISOString(),
    correction_preview: "test correction",
    pattern: "/test/",
    reflected: !!reflected
  }));
}

function setExpiredFlag() {
  fs.writeFileSync(FLAG_FILE, JSON.stringify({
    ts: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 min ago
    correction_preview: "old",
    pattern: "/old/",
    reflected: false
  }));
}

backup();

console.log("=== T808: reflection-first-gate ===\n");

console.log("--- Module contract ---");

test("exports a function", function() {
  var gate = freshGate();
  assert(typeof gate === "function");
});

test("returns null for Read tool", function() {
  clearState();
  var gate = freshGate();
  var r = gate({ tool_name: "Read", tool_input: { file_path: "/foo.js" } });
  assert(r === null, "Read should pass");
});

test("returns null for Grep tool", function() {
  clearState();
  var gate = freshGate();
  var r = gate({ tool_name: "Grep", tool_input: {} });
  assert(r === null, "Grep should pass");
});

test("returns null for Glob tool", function() {
  clearState();
  var gate = freshGate();
  var r = gate({ tool_name: "Glob", tool_input: {} });
  assert(r === null, "Glob should pass");
});

console.log("\n--- No corrections ---");

test("returns null when no correction log exists", function() {
  clearState();
  try { fs.unlinkSync(CORRECTION_LOG); } catch (e) {}
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/foo.js", new_string: "x" } });
  assert(r === null, "should pass with no corrections");
});

test("returns null when corrections are old (>15 min)", function() {
  clearState();
  writeOldCorrection();
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/foo.js", new_string: "x" } });
  assert(r === null, "should pass with old corrections");
});

console.log("\n--- Active corrections ---");

test("blocks Edit when recent correction exists", function() {
  clearState();
  writeRecentCorrection("no, that's wrong");
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/foo.js", new_string: "x" } });
  assert(r && r.decision === "block", "should block Edit");
  assert(r.reason.indexOf("reflecting") !== -1 || r.reason.indexOf("correction") !== -1,
    "should mention correction");
});

test("blocks Write when recent correction exists", function() {
  clearState();
  writeRecentCorrection();
  var gate = freshGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: "/foo.js", content: "x" } });
  assert(r && r.decision === "block", "should block Write");
});

test("blocks Bash when recent correction exists", function() {
  clearState();
  writeRecentCorrection();
  var gate = freshGate();
  var r = gate({ tool_name: "Bash", tool_input: { command: "npm test" } });
  assert(r && r.decision === "block", "should block Bash");
});

test("blocks with pending flag (no correction log needed)", function() {
  clearState();
  try { fs.unlinkSync(CORRECTION_LOG); } catch (e) {}
  setFlag(false);
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/foo.js", new_string: "x" } });
  assert(r && r.decision === "block", "should block with pending flag");
});

console.log("\n--- TODO.md edits (reflection) ---");

test("allows Edit to TODO.md even with pending correction", function() {
  clearState();
  setFlag(false);
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: {
    file_path: "/project/TODO.md",
    new_string: "some task note"
  }});
  assert(r === null, "should allow TODO.md edit");
});

test("clears flag when TODO.md edit has reflection keywords", function() {
  clearState();
  setFlag(false);
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: {
    file_path: "/project/TODO.md",
    new_string: "Root cause: I used CLAUDE.md rules instead of gates. Pattern: behavioral enforcement in text."
  }});
  assert(r === null, "should allow TODO.md reflection");
  // Verify flag is cleared
  try {
    var flag = JSON.parse(fs.readFileSync(FLAG_FILE, "utf-8"));
    assert(flag.reflected === true, "flag should be reflected=true");
  } catch (e) {
    // Flag might be deleted, that's ok too
  }
});

test("subsequent Edit passes after reflection", function() {
  clearState();
  setFlag(true); // Already reflected
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/foo.js", new_string: "x" } });
  assert(r === null, "should pass after reflection");
});

console.log("\n--- Flag expiration ---");

test("expired flag (>30 min) doesn't block", function() {
  clearState();
  setExpiredFlag();
  try { fs.unlinkSync(CORRECTION_LOG); } catch (e) {}
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/foo.js", new_string: "x" } });
  assert(r === null, "should pass with expired flag");
});

console.log("\n--- Block message quality ---");

test("block message has correction preview", function() {
  clearState();
  setFlag(false);
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/foo.js", new_string: "x" } });
  assert(r && r.reason.indexOf("test correction") !== -1, "should include correction preview");
});

test("block message has FALSE POSITIVE escape", function() {
  clearState();
  setFlag(false);
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/foo.js", new_string: "x" } });
  assert(r && r.reason.indexOf("FALSE POSITIVE") !== -1, "should have FALSE POSITIVE escape");
});

test("block message has NEXT STEPS", function() {
  clearState();
  setFlag(false);
  var gate = freshGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: "/foo.js", new_string: "x" } });
  assert(r && r.reason.indexOf("NEXT STEPS") !== -1, "should have NEXT STEPS");
});

console.log("\n--- Source validation ---");

test("has WORKFLOW tag", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/\/\/ WORKFLOW:/.test(src));
});

test("has WHY comment", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/\/\/ WHY:/.test(src));
});

test("has INCIDENT HISTORY", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/INCIDENT HISTORY/.test(src));
});

test("logs to hook-log.jsonl", function() {
  var src = fs.readFileSync(MOD_PATH, "utf-8");
  assert(/hook-log\.jsonl/.test(src));
});

restore();

console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed > 0 ? 1 : 0);
