#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/claude-p-pattern.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}
function blocks(cmd) {
  var r = gate({tool_name: "Bash", tool_input: {command: cmd}});
  return r && r.decision === "block";
}
function passesBash(cmd) {
  return gate({tool_name: "Bash", tool_input: {command: cmd}}) === null;
}

// Non-Bash/Edit/Write ignored
ok("Read tool ignored", gate({tool_name: "Read", tool_input: {}}) === null);

// === Bash gate: bad claude -p invocations ===
ok("--no-input blocked", blocks("claude -p --no-input 'analyze this'"));
ok("echo pipe blocked", blocks("echo 'task' | claude -p"));
ok("arg-based prompt blocked", blocks('claude -p "analyze the file" 2>&1'));

// Good claude -p invocations allowed
ok("stdin redirect allowed", passesBash("claude -p < promptfile.txt"));
ok("non-claude command allowed", passesBash("node setup.js"));
ok("empty command allowed", passesBash(""));

// === Edit gate: bad patterns in scripts ===
// ANTHROPIC_API_KEY anti-pattern
var r1 = gate({tool_name: "Edit", tool_input: {
  file_path: "/scripts/analyze.py",
  new_string: "api_key = os.environ['ANTHROPIC_API_KEY']"
}});
ok("ANTHROPIC_API_KEY blocked", r1 && r1.decision === "block");

// base64 encoding anti-pattern
var r2 = gate({tool_name: "Write", tool_input: {
  file_path: "/scripts/review.py",
  content: "# Send to claude -p\nencoded = base64.b64encode(open('img.png', 'rb').read())"
}});
ok("base64 encode image blocked", r2 && r2.decision === "block");

// import anthropic SDK anti-pattern
var r3 = gate({tool_name: "Edit", tool_input: {
  file_path: "/scripts/checker.py",
  new_string: "import anthropic\nclient = anthropic.Anthropic()"
}});
ok("import anthropic blocked", r3 && r3.decision === "block");

// Self-reference (hook module files) allowed
var r4 = gate({tool_name: "Edit", tool_input: {
  file_path: "/run-modules/PreToolUse/claude-p-pattern.js",
  new_string: "import anthropic"
}});
ok("own module file allowed", r4 === null);

// Normal edits allowed
var r5 = gate({tool_name: "Edit", tool_input: {
  file_path: "/src/app.py",
  new_string: "result = process_data(input)"
}});
ok("normal edit allowed", r5 === null);

// Block message quality
ok("bash block has correct pattern", gate({tool_name: "Bash", tool_input: {command: "claude -p --no-input x"}}).reason.indexOf("PROMPTFILE") !== -1);
ok("edit block mentions no API key", r1 && /no.*key|doesn.*t.*need/i.test(r1.reason));

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
