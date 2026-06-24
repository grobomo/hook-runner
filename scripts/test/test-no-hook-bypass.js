#!/usr/bin/env node
"use strict";
// T570: Tests for no-hook-bypass.js
// Blocks Bash file writes that bypass Write/Edit gates, and bypass language in descriptions.

var path = require("path");
var fs = require("fs");
var os = require("os");
var modPath = path.join(__dirname, "..", "..", "modules", "PreToolUse", "no-hook-bypass.js");
var passed = 0, failed = 0;

function check(name, fn) {
  try { fn(); console.log("OK: " + name); passed++; }
  catch (e) { console.log("FAIL: " + name + " — " + e.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

// Fresh load each time (flag file state matters)
function loadGate() {
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

function makeInput(cmd, desc) {
  var input = { tool_name: "Bash", tool_input: { command: cmd } };
  if (desc) input.tool_input.description = desc;
  return input;
}

// --- Tests ---

check("Non-Bash tool: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Edit", tool_input: { file_path: "x" } }) === null);
});

check("Bash non-write command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("ls -la")) === null);
});

check("Bash git command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("git status")) === null);
});

check("Bash npm command: passes", function() {
  var gate = loadGate();
  assert(gate(makeInput("npm test")) === null);
});

check("cat > file: detected as write", function() {
  // Without flag file, should pass (no active instruction-to-hook)
  var gate = loadGate();
  var r = gate(makeInput('cat > /tmp/test.txt <<EOF\nhello\nEOF'));
  assert(r === null, "without flag should pass");
});

check("echo > file: detected as write", function() {
  var gate = loadGate();
  var r = gate(makeInput('echo "hello" > /tmp/test.txt'));
  assert(r === null, "without flag should pass");
});

check("tee file: detected as write", function() {
  var gate = loadGate();
  var r = gate(makeInput('echo "data" | tee /tmp/out.txt'));
  assert(r === null, "without flag should pass");
});

check("printf > file: detected as write", function() {
  var gate = loadGate();
  var r = gate(makeInput('printf "%s" "data" > /tmp/out.txt'));
  assert(r === null, "without flag should pass");
});

check("cat >> file: detected as append write", function() {
  var gate = loadGate();
  var r = gate(makeInput('cat >> /tmp/test.txt <<EOF\nmore\nEOF'));
  assert(r === null, "without flag should pass");
});

check("Description with 'bypass': blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('echo "x" > /tmp/test.txt', "Bypass the write gate"));
  assert(r !== null, "should block");
  assert(r.decision === "block");
  assert(/BLOCKED|bypass|circumvent/i.test(r.reason));
});

check("Description with 'work around': blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('echo "x" > /tmp/test.txt', "Work around the hook check"));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Description with 'circumvent': blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('echo "x" > /tmp/test.txt', "Circumvent the gate"));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Description with 'avoid hook': blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('cat > /tmp/test.txt', "Avoid the hook enforcement"));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Description with 'skip check': blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('echo "y" > /tmp/test.txt', "Skip the check this time"));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Command with 'bypass' word: blocks", function() {
  var gate = loadGate();
  var r = gate(makeInput('echo "bypass the gate" > /tmp/test.txt'));
  assert(r !== null, "should block");
  assert(r.decision === "block");
});

check("Normal write description: passes", function() {
  var gate = loadGate();
  var r = gate(makeInput('echo "hello" > /tmp/test.txt', "Write test data"));
  assert(r === null, "normal desc should pass");
});

check("Empty command: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: { command: "" } }) === null);
});

check("Empty tool_input: passes", function() {
  var gate = loadGate();
  assert(gate({ tool_name: "Bash", tool_input: {} }) === null);
});

check("Flag file active + write to non-hook path: blocks", function() {
  var flagPath = path.join(os.tmpdir(), ".claude-instruction-pending");
  fs.writeFileSync(flagPath, "active");
  try {
    var gate = loadGate();
    var r = gate(makeInput('cat > /tmp/random-file.txt <<EOF\nstuff\nEOF'));
    assert(r !== null, "should block when flag active");
    assert(r.decision === "block");
    assert(r.reason.indexOf("instruction-to-hook") !== -1);
  } finally {
    try { fs.unlinkSync(flagPath); } catch(e) {}
  }
});

check("Flag file active + write to run-modules/ path: passes (allowed)", function() {
  var flagPath = path.join(os.tmpdir(), ".claude-instruction-pending");
  fs.writeFileSync(flagPath, "active");
  try {
    var gate = loadGate();
    var modTarget = os.homedir().replace(/\\/g, "/") + "/.claude/hooks/run-modules/PreToolUse/gate.js";
    var r = gate(makeInput('cat > "' + modTarget + '" <<EOF\nmodule.exports=fn\nEOF'));
    assert(r === null, "writing to run-modules should be allowed");
  } finally {
    try { fs.unlinkSync(flagPath); } catch(e) {}
  }
});

check("Flag file active + write to settings.json: passes (allowed)", function() {
  var flagPath = path.join(os.tmpdir(), ".claude-instruction-pending");
  fs.writeFileSync(flagPath, "active");
  try {
    var gate = loadGate();
    var r = gate(makeInput('echo "{}" > settings.json'));
    assert(r === null, "writing to settings.json should be allowed");
  } finally {
    try { fs.unlinkSync(flagPath); } catch(e) {}
  }
});

// Summary
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed > 0 ? 1 : 0);
