#!/usr/bin/env node
"use strict";
var path = require("path");
var gate = require(path.join(__dirname, "../../modules/PreToolUse/why-reminder.js"));

var pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("OK: " + name); }
  else { fail++; console.log("FAIL: " + name); }
}

// Non-Edit/Write ignored
ok("Read ignored", gate({tool_name: "Read", tool_input: {}}) === null);
ok("Bash ignored", gate({tool_name: "Bash", tool_input: {}}) === null);

// Code files get reminder (non-blocking)
var r1 = gate({tool_name: "Edit", tool_input: {file_path: "/src/gate.js", old_string: "a", new_string: "b"}});
ok("JS file: returns text reminder", r1 && r1.text && /WHY/i.test(r1.text));
ok("JS file: not a block", !r1 || r1.decision !== "block");

var r2 = gate({tool_name: "Write", tool_input: {file_path: "/config.yaml", content: "key: val"}});
ok("YAML file: returns reminder", r2 && r2.text);

var r3 = gate({tool_name: "Edit", tool_input: {file_path: "/script.py", old_string: "a", new_string: "b"}});
ok("Python file: returns reminder", r3 && r3.text);

// Binary files skipped
ok("PNG skipped", gate({tool_name: "Write", tool_input: {file_path: "/img.png", content: ""}}) === null);
ok("PDF skipped", gate({tool_name: "Write", tool_input: {file_path: "/doc.pdf", content: ""}}) === null);
ok("ZIP skipped", gate({tool_name: "Write", tool_input: {file_path: "/a.zip", content: ""}}) === null);

// Non-code extensions skipped
ok("no extension skipped", gate({tool_name: "Write", tool_input: {file_path: "/Makefile", content: ""}}) === null);

// Empty path skipped
ok("empty path skipped", gate({tool_name: "Edit", tool_input: {file_path: ""}}) === null);

console.log("\n" + pass + "/" + (pass+fail) + " passed");
process.exit(fail > 0 ? 1 : 0);
