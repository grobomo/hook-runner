#!/usr/bin/env node
"use strict";
// T583: Tests for crlf-detector.js (PostToolUse)
// Detects CRLF line endings in sensitive file types.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PostToolUse", "crlf-detector.js");
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

var tmpDir = path.join(os.tmpdir(), "test-crlf-detector-" + Date.now());
fs.mkdirSync(tmpDir, { recursive: true });

function writeTmpFile(name, content) {
  var p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, "binary"); // binary to preserve exact bytes
  return p;
}

// --- Non-applicable inputs ---

check("Non-Write/Edit tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "ls" } }) === null);
});

check("Read tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Read", tool_input: { file_path: "/tmp/script.sh" } }) === null);
});

// --- Non-sensitive file types: passes ---

check(".js file: passes (not sensitive)", function() {
  var p = writeTmpFile("test.js", "line1\r\nline2\r\n");
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: p } }) === null);
});

check(".html file: passes", function() {
  var p = writeTmpFile("page.html", "line1\r\nline2\r\n");
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: p } }) === null);
});

check(".md file: passes", function() {
  var p = writeTmpFile("readme.md", "line1\r\nline2\r\n");
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: p } }) === null);
});

// --- Sensitive files with LF only: passes ---

check(".sh with LF: passes", function() {
  var p = writeTmpFile("deploy.sh", "#!/bin/bash\necho hello\n");
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: p } }) === null);
});

check(".yml with LF: passes", function() {
  var p = writeTmpFile("config.yml", "key: value\nother: true\n");
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: p } }) === null);
});

check(".py with LF: passes", function() {
  var p = writeTmpFile("script.py", "import os\nprint('hi')\n");
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: p } }) === null);
});

// --- Sensitive files with CRLF: blocks ---

check(".sh with CRLF: blocks", function() {
  var p = writeTmpFile("bad.sh", "#!/bin/bash\r\necho hello\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(r.reason.indexOf("CRLF") !== -1);
  assert(r.reason.indexOf("bad.sh") !== -1);
  assert(r.reason.indexOf("2 CRLF") !== -1);
});

check(".bash with CRLF: blocks", function() {
  var p = writeTmpFile("run.bash", "line\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null, "should block");
  assert(r.reason.indexOf("1 CRLF") !== -1);
});

check(".yml with CRLF: blocks", function() {
  var p = writeTmpFile("action.yml", "name: test\r\nrun: echo\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Edit", tool_input: { file_path: p } });
  assert(r !== null, "should block");
});

check(".yaml with CRLF: blocks", function() {
  var p = writeTmpFile("config.yaml", "a: 1\r\nb: 2\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null, "should block");
});

check(".py with CRLF: blocks", function() {
  var p = writeTmpFile("app.py", "import sys\r\nsys.exit(0)\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null, "should block");
});

check(".rb with CRLF: blocks", function() {
  var p = writeTmpFile("script.rb", "puts 'hi'\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null, "should block");
});

check(".pl with CRLF: blocks", function() {
  var p = writeTmpFile("script.pl", "print 'hi'\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null, "should block");
});

check(".env with CRLF: blocks", function() {
  var p = writeTmpFile("local.env", "KEY=value\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null, "should block");
});

check(".conf with CRLF: blocks", function() {
  var p = writeTmpFile("app.conf", "port=8080\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null, "should block");
});

check(".cfg with CRLF: blocks", function() {
  var p = writeTmpFile("setup.cfg", "[tool]\r\noption=1\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null, "should block");
});

// --- CRLF count accuracy ---

check("Counts CRLF occurrences correctly", function() {
  var p = writeTmpFile("multi.sh", "a\r\nb\r\nc\r\nd\r\ne\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null);
  assert(r.reason.indexOf("5 CRLF") !== -1, "should report 5 CRLF");
});

// --- Reason includes sed fix command ---

check("Reason includes sed fix command", function() {
  var p = writeTmpFile("fixme.sh", "line\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: { file_path: p } });
  assert(r !== null);
  assert(r.reason.indexOf("sed") !== -1, "should suggest sed fix");
});

// --- String tool_input ---

check("String tool_input: parses correctly", function() {
  var p = writeTmpFile("str.sh", "x\r\n");
  var gate = loadGate();
  var r = gate({ tool_name: "Write", tool_input: JSON.stringify({ file_path: p }) });
  assert(r !== null, "should block");
});

// --- File doesn't exist: passes ---

check("File doesn't exist: passes gracefully", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: tmpDir + "/nonexistent.sh" } }) === null);
});

// --- Edge cases ---

check("Empty file_path: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write", tool_input: { file_path: "" } }) === null);
});

check("Missing tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Write" }) === null);
});

// --- Cleanup ---
try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}

// --- Summary ---
console.log("\n=== Results: " + passed + " passed, " + failed + " failed ===");
process.exit(failed > 0 ? 1 : 0);
